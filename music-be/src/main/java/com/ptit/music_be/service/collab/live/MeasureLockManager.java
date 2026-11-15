package com.ptit.music_be.service.collab.live;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.ptit.music_be.service.collab.live.LiveMessages.LockEntry;
import com.ptit.music_be.service.collab.live.LiveMessages.LocksBroadcast;

/**
 * Khóa mềm theo ô nhịp (mục 4.4, bước 2). Ai bắt đầu sửa ô nào thì giữ ô đó {@value #TTL_SECONDS} giây, tự gia hạn khi có
 * thao tác hoặc nhịp tim; người khác không sửa được ô đang bị giữ. Thao tác toàn bài (đổi khóa, nhịp, thêm/xóa ô, thêm
 * part) cần giữ cả bài, và chỉ giữ được khi không ai khác giữ bất kỳ ô nào.
 *
 * <p>Xin khóa là "tất cả hoặc không": nếu một ô bị người khác giữ thì không ô nào được cấp. Chủ khóa là sessionId.
 */
@Component
public class MeasureLockManager {

    static final long TTL_SECONDS = 60;
    static final Duration TTL = Duration.ofSeconds(TTL_SECONDS);

    /** Một ô nhịp: part và thứ tự ô, cùng từ 0. */
    public record Key(int partIndex, int measureIndex) {}

    /** Kết quả xin khóa; {@code heldBy} là sessionId đang chặn khi không được cấp. */
    public record Grant(boolean granted, String heldBy) {}

    private static final class Held {
        final String sessionId;
        Instant expiresAt;

        Held(String sessionId, Instant expiresAt) {
            this.sessionId = sessionId;
            this.expiresAt = expiresAt;
        }
    }

    private static final class ScoreLocks {
        final Map<Key, Held> measures = new HashMap<>();
        Held whole;

        boolean isEmpty() {
            return measures.isEmpty() && whole == null;
        }
    }

    private final Map<String, ScoreLocks> scores = new HashMap<>();

    public synchronized Grant acquire(String scoreId, String sessionId, Collection<Key> keys, boolean whole, Instant now) {
        ScoreLocks locks = scores.computeIfAbsent(scoreId, k -> new ScoreLocks());
        purge(locks, now);
        Instant expiry = now.plus(TTL);

        if (locks.whole != null && !locks.whole.sessionId.equals(sessionId)) {
            return new Grant(false, locks.whole.sessionId);
        }
        if (whole) {
            for (Held held : locks.measures.values()) {
                if (!held.sessionId.equals(sessionId)) {
                    return new Grant(false, held.sessionId);
                }
            }
            locks.whole = new Held(sessionId, expiry);
            return new Grant(true, null);
        }
        for (Key key : keys) {
            Held held = locks.measures.get(key);
            if (held != null && !held.sessionId.equals(sessionId)) {
                return new Grant(false, held.sessionId);
            }
        }
        for (Key key : keys) {
            locks.measures.put(key, new Held(sessionId, expiry));
        }
        return new Grant(true, null);
    }

    /** Nhả các ô (hoặc cả bài) của session; trả true nếu có gì đổi. */
    public synchronized boolean release(String scoreId, String sessionId, Collection<Key> keys, boolean whole) {
        ScoreLocks locks = scores.get(scoreId);
        if (locks == null) {
            return false;
        }
        boolean changed = false;
        if (whole && locks.whole != null && locks.whole.sessionId.equals(sessionId)) {
            locks.whole = null;
            changed = true;
        }
        for (Key key : keys) {
            Held held = locks.measures.get(key);
            if (held != null && held.sessionId.equals(sessionId)) {
                locks.measures.remove(key);
                changed = true;
            }
        }
        dropIfEmpty(scoreId, locks);
        return changed;
    }

    /** Nhả mọi khóa của session trong bản nhạc; trả true nếu có gì đổi. */
    public synchronized boolean releaseAll(String scoreId, String sessionId) {
        ScoreLocks locks = scores.get(scoreId);
        if (locks == null) {
            return false;
        }
        boolean changed = locks.measures.values().removeIf(h -> h.sessionId.equals(sessionId));
        if (locks.whole != null && locks.whole.sessionId.equals(sessionId)) {
            locks.whole = null;
            changed = true;
        }
        dropIfEmpty(scoreId, locks);
        return changed;
    }

    /** Gia hạn mọi khóa của session (nhịp tim hoặc có thao tác). */
    public synchronized void renew(String scoreId, String sessionId, Instant now) {
        ScoreLocks locks = scores.get(scoreId);
        if (locks == null) {
            return;
        }
        Instant expiry = now.plus(TTL);
        locks.measures.values().stream().filter(h -> h.sessionId.equals(sessionId)).forEach(h -> h.expiresAt = expiry);
        if (locks.whole != null && locks.whole.sessionId.equals(sessionId)) {
            locks.whole.expiresAt = expiry;
        }
    }

    /** Session đang giữ khóa đủ cho thao tác này không: cả bài thì phủ mọi ô, ngược lại phải giữ từng ô. */
    public synchronized boolean holds(String scoreId, String sessionId, Collection<Key> keys, boolean whole, Instant now) {
        ScoreLocks locks = scores.get(scoreId);
        if (locks == null) {
            return false;
        }
        purge(locks, now);
        boolean holdsWhole = locks.whole != null && locks.whole.sessionId.equals(sessionId);
        if (whole) {
            return holdsWhole;
        }
        if (holdsWhole) {
            return true;
        }
        for (Key key : keys) {
            Held held = locks.measures.get(key);
            if (held == null || !held.sessionId.equals(sessionId)) {
                return false;
            }
        }
        return true;
    }

    /** Bỏ các khóa đã hết hạn; trả id các bản nhạc có khóa thay đổi để phát lại danh sách. */
    public synchronized Set<String> expire(Instant now) {
        Set<String> changed = new java.util.HashSet<>();
        for (Map.Entry<String, ScoreLocks> entry : new ArrayList<>(scores.entrySet())) {
            if (purge(entry.getValue(), now)) {
                changed.add(entry.getKey());
            }
            dropIfEmpty(entry.getKey(), entry.getValue());
        }
        return changed;
    }

    public synchronized LocksBroadcast snapshot(String scoreId, Instant now) {
        ScoreLocks locks = scores.get(scoreId);
        if (locks == null) {
            return new LocksBroadcast(scoreId, null, List.of());
        }
        purge(locks, now);
        List<LockEntry> entries = new ArrayList<>();
        locks.measures.forEach((key, held) -> entries.add(new LockEntry(key.partIndex(), key.measureIndex(), held.sessionId)));
        entries.sort(java.util.Comparator.comparingInt(LockEntry::partIndex).thenComparingInt(LockEntry::measureIndex));
        return new LocksBroadcast(scoreId, locks.whole == null ? null : locks.whole.sessionId, entries);
    }

    /** Xóa mọi khóa của bản nhạc (khi đóng phiên). */
    public synchronized void clear(String scoreId) {
        scores.remove(scoreId);
    }

    private boolean purge(ScoreLocks locks, Instant now) {
        boolean changed = locks.measures.values().removeIf(h -> !h.expiresAt.isAfter(now));
        if (locks.whole != null && !locks.whole.expiresAt.isAfter(now)) {
            locks.whole = null;
            changed = true;
        }
        return changed;
    }

    private void dropIfEmpty(String scoreId, ScoreLocks locks) {
        if (locks.isEmpty()) {
            scores.remove(scoreId);
        }
    }
}
