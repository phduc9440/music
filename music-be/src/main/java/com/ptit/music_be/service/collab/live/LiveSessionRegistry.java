package com.ptit.music_be.service.collab.live;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

import com.ptit.music_be.service.collab.live.LiveMessages.Selection;

/**
 * Ai đang ở trong phiên của bản nhạc nào (mục 4.4, bước 1 "hiện diện"). Mỗi tab trình duyệt là một người tham gia riêng
 * (khóa theo sessionId của WebSocket), nên cùng một tài khoản mở hai tab được tính hai lần và cũng giữ khóa riêng.
 *
 * <p>Giữ trong bộ nhớ một máy chủ, như broker STOMP đang dùng. Tối đa {@value #MAX_EDITORS} người sửa mỗi bản; số người
 * chỉ xem không giới hạn.
 */
@Component
public class LiveSessionRegistry {

    public static final int MAX_EDITORS = 10;

    /** Quá khoảng này không có nhịp tim thì coi như đã rời (nhịp tim 15 giây). */
    public static final Duration PRESENCE_TIMEOUT = Duration.ofSeconds(45);

    /** Số màu để phân biệt người trong phiên; web ánh xạ chỉ số sang token màu. */
    static final int COLORS = 8;

    /** Một người bị loại khỏi phiên. */
    public record Removed(String scoreId, LiveParticipant participant) {}

    /** Kết quả vào phiên / cập nhật: người tham gia, và có bị từ chối quyền sửa vì phiên đầy không. */
    public record Joined(LiveParticipant participant, boolean fullDenied, boolean isNew) {}

    private final Map<String, Map<String, LiveParticipant>> sessions = new ConcurrentHashMap<>();

    /** Bản nhạc đang có {@code LiveDocument} mở (kể cả khi chưa lưu xong). Đọc từ luồng khác nên dùng tập đồng thời. */
    private final Set<String> activeScores = ConcurrentHashMap.newKeySet();

    /**
     * Vào phiên hoặc cập nhật trạng thái (nhịp tim). Muốn sửa mà phiên đã đủ người sửa thì vẫn vào với vai trò xem và
     * {@code fullDenied = true}.
     */
    public synchronized Joined upsert(
            String scoreId,
            String sessionId,
            String email,
            String memberId,
            String name,
            boolean wantEditing,
            Selection selection,
            Instant now) {
        Map<String, LiveParticipant> inScore = sessions.computeIfAbsent(scoreId, k -> new LinkedHashMap<>());
        LiveParticipant participant = inScore.get(sessionId);
        boolean isNew = participant == null;
        if (isNew) {
            participant = new LiveParticipant(sessionId, email, memberId, name, now);
            participant.colorIndex = freeColor(inScore.values());
            inScore.put(sessionId, participant);
        }
        participant.lastSeen = now;
        participant.selection = selection;
        boolean fullDenied = false;
        if (wantEditing && !participant.editing) {
            if (editorCount(inScore) >= MAX_EDITORS) {
                fullDenied = true;
            } else {
                participant.editing = true;
            }
        } else if (!wantEditing) {
            participant.editing = false;
        }
        return new Joined(participant, fullDenied, isNew);
    }

    public synchronized LiveParticipant find(String scoreId, String sessionId) {
        Map<String, LiveParticipant> inScore = sessions.get(scoreId);
        return inScore == null ? null : inScore.get(sessionId);
    }

    /** Người đang ở trong phiên, theo thứ tự vào. */
    public synchronized List<LiveParticipant> participants(String scoreId) {
        Map<String, LiveParticipant> inScore = sessions.get(scoreId);
        return inScore == null ? List.of() : new ArrayList<>(inScore.values());
    }

    public synchronized int editorCount(String scoreId) {
        Map<String, LiveParticipant> inScore = sessions.get(scoreId);
        return inScore == null ? 0 : editorCount(inScore);
    }

    public synchronized LiveParticipant remove(String scoreId, String sessionId) {
        Map<String, LiveParticipant> inScore = sessions.get(scoreId);
        if (inScore == null) {
            return null;
        }
        LiveParticipant removed = inScore.remove(sessionId);
        if (inScore.isEmpty()) {
            sessions.remove(scoreId);
        }
        return removed;
    }

    /** Bỏ phiên WebSocket này khỏi mọi bản nhạc (khi mất kết nối). */
    public synchronized List<Removed> removeSession(String sessionId) {
        List<Removed> removed = new ArrayList<>();
        for (String scoreId : new ArrayList<>(sessions.keySet())) {
            LiveParticipant participant = remove(scoreId, sessionId);
            if (participant != null) {
                removed.add(new Removed(scoreId, participant));
            }
        }
        return removed;
    }

    /** Bỏ những người quá {@link #PRESENCE_TIMEOUT} không có nhịp tim. */
    public synchronized List<Removed> expire(Instant now) {
        Instant limit = now.minus(PRESENCE_TIMEOUT);
        List<Removed> removed = new ArrayList<>();
        for (String scoreId : new ArrayList<>(sessions.keySet())) {
            for (LiveParticipant participant : participants(scoreId)) {
                if (participant.lastSeen.isBefore(limit)) {
                    remove(scoreId, participant.sessionId);
                    removed.add(new Removed(scoreId, participant));
                }
            }
        }
        return removed;
    }

    /** Bản nhạc đang có phiên sửa chung: phải sửa qua kênh cộng tác, không lưu thẳng bằng PUT. */
    public boolean isActive(String scoreId) {
        return activeScores.contains(scoreId);
    }

    public void markActive(String scoreId) {
        activeScores.add(scoreId);
    }

    public void markIdle(String scoreId) {
        activeScores.remove(scoreId);
    }

    public Set<String> activeScoreIds() {
        return new HashSet<>(activeScores);
    }

    private static int editorCount(Map<String, LiveParticipant> inScore) {
        return (int) inScore.values().stream().filter(LiveParticipant::editing).count();
    }

    /** Màu nhỏ nhất chưa ai trong bản này dùng; hết màu thì dùng lại theo vòng. */
    private static int freeColor(Iterable<LiveParticipant> current) {
        Set<Integer> used = new HashSet<>();
        current.forEach(p -> used.add(p.colorIndex));
        for (int i = 0; i < COLORS; i++) {
            if (!used.contains(i)) {
                return i;
            }
        }
        return used.stream().max(Comparator.naturalOrder()).orElse(0) % COLORS;
    }
}
