package com.ptit.music_be.service.collab.live;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.PageRequest;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.response.score.ScoreContent;
import com.ptit.music_be.dto.response.score.ScoreSaveResponse;
import com.ptit.music_be.entity.ScoreLiveOp;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.score.ScoreLiveOpRepository;
import com.ptit.music_be.service.collab.live.LiveAccess.Access;
import com.ptit.music_be.service.collab.live.LiveMessages.JoinRequest;
import com.ptit.music_be.service.collab.live.LiveMessages.JoinResult;
import com.ptit.music_be.service.collab.live.LiveMessages.LockRequest;
import com.ptit.music_be.service.collab.live.LiveMessages.LockResult;
import com.ptit.music_be.service.collab.live.LiveMessages.MeasureChange;
import com.ptit.music_be.service.collab.live.LiveMessages.MeasureRef;
import com.ptit.music_be.service.collab.live.LiveMessages.OpBroadcast;
import com.ptit.music_be.service.collab.live.LiveMessages.OpRejected;
import com.ptit.music_be.service.collab.live.LiveMessages.OpsRequest;
import com.ptit.music_be.service.collab.live.LiveMessages.PresenceBroadcast;
import com.ptit.music_be.service.collab.live.LiveMessages.PresenceRequest;
import com.ptit.music_be.service.collab.live.LiveMessages.VersionBroadcast;
import com.ptit.music_be.service.collab.live.MeasureLockManager.Grant;
import com.ptit.music_be.service.collab.live.MeasureLockManager.Key;
import com.ptit.music_be.service.score.ScoreContentService;
import com.ptit.music_be.service.score.ScoreEditService;
import com.ptit.music_be.service.score.impl.LiveDocument;
import com.ptit.music_be.service.score.impl.LiveDocument.MeasureEdit;
import com.ptit.music_be.service.score.impl.LiveDocument.Outcome;
import com.ptit.music_be.service.score.impl.LiveDocument.Reason;

import lombok.extern.slf4j.Slf4j;

/**
 * Điều phối đồng chỉnh sửa thời gian thực (mục 4.4): hiện diện, khóa mềm theo ô, đồng bộ thao tác và gom thao tác thành
 * version. Server là nơi quyết định duy nhất; không dùng CRDT vì MusicXML có ràng buộc giữa các phần tử (tổng trường độ
 * của ô, dấu nối qua ô, chùm ba) mà trộn tự động có thể làm sai.
 *
 * <p>Vòng đời một phiên: người sửa đầu tiên {@link #join vào} thì nạp MusicXML hiện hành vào {@link LiveDocument}; mỗi
 * thao tác hợp lệ được cấp seq, ghi {@code score_live_ops} và phát cho cả phiên; khi yên {@value #IDLE_SAVE_SECONDS} giây,
 * khi người cuối rời hoặc khi có người bấm Lưu thì lưu thành version mới qua
 * {@link ScoreEditService#saveLiveSnapshot}. Trong lúc có phiên, mọi đường lưu khác bị chặn (3122).
 */
@Service
@Slf4j
public class LiveCollabService {

    static final int IDLE_SAVE_SECONDS = 30;
    static final int MAX_OPS_PER_SECOND = 20;
    static final int MAX_MEASURE_OP_BYTES = 256 * 1024;
    static final int MAX_STRUCTURAL_BYTES = 1024 * 1024;
    static final int MAX_LOCK_KEYS = 64;
    /** Số thao tác tối đa phát lại cho client kết nối lại; nhiều hơn thì bắt tải lại cả bài. */
    static final int MAX_REPLAY = 1000;

    /** Một phiên đang mở: tài liệu, lần sửa gần nhất và những người đã sửa (mới nhất cuối). */
    private static final class Live {
        final LiveDocument document;
        volatile Instant lastOpAt;
        final Map<String, String> editors = Collections.synchronizedMap(new LinkedHashMap<>());

        Live(LiveDocument document, Instant now) {
            this.document = document;
            this.lastOpAt = now;
        }

        void touchEditor(String email, String name) {
            editors.remove(email);
            editors.put(email, name);
        }

        /** Email người sửa, người mới nhất trước: người này gần như chắc chắn còn quyền lưu. */
        List<String> emailsNewestFirst() {
            synchronized (editors) {
                List<String> emails = new ArrayList<>(editors.keySet());
                Collections.reverse(emails);
                return emails;
            }
        }

        List<String> names() {
            synchronized (editors) {
                return new ArrayList<>(editors.values());
            }
        }
    }

    private final LiveSessionRegistry registry;
    private final MeasureLockManager locks;
    private final LiveAccess access;
    private final LiveSecurity security;
    private final ScoreContentService scoreContentService;
    private final ScoreEditService scoreEditService;
    private final ScoreLiveOpRepository opRepository;
    private final SimpMessagingTemplate messaging;
    private final ObjectMapper json;
    private final Clock clock;

    private final Map<String, Live> lives = new ConcurrentHashMap<>();

    @Autowired
    public LiveCollabService(
            LiveSessionRegistry registry,
            MeasureLockManager locks,
            LiveAccess access,
            LiveSecurity security,
            ScoreContentService scoreContentService,
            ScoreEditService scoreEditService,
            ScoreLiveOpRepository opRepository,
            SimpMessagingTemplate messaging,
            ObjectMapper json) {
        this(
                registry,
                locks,
                access,
                security,
                scoreContentService,
                scoreEditService,
                opRepository,
                messaging,
                json,
                Clock.systemUTC());
    }

    /** Cho kiểm thử: đồng hồ giả để thử hết hạn nhịp tim, khóa và lưu khi yên. */
    LiveCollabService(
            LiveSessionRegistry registry,
            MeasureLockManager locks,
            LiveAccess access,
            LiveSecurity security,
            ScoreContentService scoreContentService,
            ScoreEditService scoreEditService,
            ScoreLiveOpRepository opRepository,
            SimpMessagingTemplate messaging,
            ObjectMapper json,
            Clock clock) {
        this.registry = registry;
        this.locks = locks;
        this.access = access;
        this.security = security;
        this.scoreContentService = scoreContentService;
        this.scoreEditService = scoreEditService;
        this.opRepository = opRepository;
        this.messaging = messaging;
        this.json = json;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- vào, rời, hiện diện

    /**
     * Vào phiên để sửa (hoặc vào lại sau khi mất mạng). Trả lời riêng người vào: cả bài nếu họ chưa có seq hợp lệ, hoặc
     * các thao tác còn thiếu.
     *
     * @throws AppException UNAUTHORIZED (1002) nếu không có quyền sửa; LIVE_COLLAB_NOT_AVAILABLE (3123) nếu gói không
     *     cho; LIVE_SESSION_FULL (3121) khi đã đủ người sửa (người vào bị từ chối, không có quyền sửa)
     */
    public void join(String scoreId, String sessionId, String email, JoinRequest request) {
        Access who = access.resolve(email, scoreId);
        if (!who.canEdit()) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
        access.requireCollab(who);
        Instant now = clock.instant();
        LiveSessionRegistry.Joined joined = registry.upsert(
                scoreId, sessionId, email, who.memberId(), who.memberName(), true, request.selection(), now);
        if (joined.fullDenied()) {
            // Không giữ chỗ người xem trong phiên sửa: rời hẳn để không chiếm màu và danh sách
            registry.remove(scoreId, sessionId);
            throw new AppException(ErrorCode.LIVE_SESSION_FULL);
        }
        Live live;
        try {
            live = open(scoreId, email);
        } catch (RuntimeException e) {
            registry.remove(scoreId, sessionId);
            throw e;
        }
        live.touchEditor(email, who.memberName());
        broadcastPresence(scoreId);
        replyToUser(email, "/queue/live-join", joinResult(scoreId, sessionId, live, request.lastSeq()));
    }

    /** Nhịp tim và vùng chọn. Chỉ phát lại danh sách người khi vùng chọn đổi. */
    public void presence(String scoreId, String sessionId, String email, PresenceRequest request) {
        LiveParticipant participant = requireEditor(scoreId, sessionId);
        Instant now = clock.instant();
        boolean changed = !java.util.Objects.equals(participant.selection, request.selection());
        registry.upsert(
                scoreId,
                sessionId,
                email,
                participant.memberId(),
                participant.name(),
                true,
                request.selection(),
                now);
        locks.renew(scoreId, sessionId, now);
        if (changed) {
            broadcastPresence(scoreId);
        }
    }

    /** Rời phiên theo ý người dùng (đóng Editor, tắt chế độ cộng tác). */
    public void leave(String scoreId, String sessionId) {
        LiveParticipant participant = registry.remove(scoreId, sessionId);
        if (participant != null) {
            afterRemoved(scoreId, participant);
        }
    }

    /** Mất kết nối WebSocket: bỏ người này khỏi mọi phiên, nhả khóa. */
    @EventListener
    public void onDisconnect(SessionDisconnectEvent event) {
        for (LiveSessionRegistry.Removed removed : registry.removeSession(event.getSessionId())) {
            afterRemoved(removed.scoreId(), removed.participant());
        }
    }

    // ---------------------------------------------------------------- khóa

    public void lock(String scoreId, String sessionId, String email, LockRequest request) {
        requireEditor(scoreId, sessionId);
        Live live = lives.get(scoreId);
        if (live == null) {
            throw new AppException(ErrorCode.LIVE_OP_INVALID);
        }
        List<Key> keys = keysOf(live, request.measures());
        Instant now = clock.instant();
        if (request.release()) {
            boolean changed = locks.release(scoreId, sessionId, keys, request.whole());
            replyToUser(email, "/queue/live-locks", new LockResult(scoreId, sessionId, true, true, null, null));
            if (changed) {
                broadcastLocks(scoreId);
            }
            return;
        }
        Grant grant = locks.acquire(scoreId, sessionId, keys, request.whole(), now);
        String heldByName = null;
        if (!grant.granted()) {
            LiveParticipant holder = registry.find(scoreId, grant.heldBy());
            heldByName = holder == null ? null : holder.name();
        }
        replyToUser(
                email,
                "/queue/live-locks",
                new LockResult(scoreId, sessionId, grant.granted(), false, grant.heldBy(), heldByName));
        if (grant.granted()) {
            broadcastLocks(scoreId);
        }
    }

    // ---------------------------------------------------------------- thao tác

    /**
     * Nhận một gói thao tác. Hợp lệ thì cấp seq, ghi nhật ký và phát cho cả phiên; không thì gửi riêng người gửi
     * {@code live-rejected} kèm nội dung hiện tại của các ô để họ tải lại.
     */
    public void ops(String scoreId, String sessionId, String email, OpsRequest request) {
        LiveParticipant participant = requireEditor(scoreId, sessionId);
        validate(request);
        Instant now = clock.instant();
        if (!participant.allowOp(now, MAX_OPS_PER_SECOND)) {
            throw new AppException(ErrorCode.LIVE_RATE_LIMITED);
        }
        Live live = lives.get(scoreId);
        if (live == null) {
            sendRejected(email, scoreId, request.opId(), "STALE", 0, List.of(), null);
            return;
        }

        boolean structural = request.structural() != null;
        List<Key> keys = structural
                ? List.of()
                : request.measures().stream()
                        .map(m -> new Key(m.partIndex(), m.measureIndex()))
                        .toList();
        if (!locks.holds(scoreId, sessionId, keys, structural, now)) {
            sendRejected(email, scoreId, request.opId(), "LOCK_REQUIRED", live.document.seq(), currentOf(live, request), null);
            return;
        }

        synchronized (live.document.lock()) {
            Outcome outcome = structural
                    ? live.document.applyStructural(
                            request.opId(), request.baseSeq(), request.structural().afterXml())
                    : live.document.applyMeasures(request.opId(), editsOf(request.measures()));
            if (outcome.duplicate()) {
                return;
            }
            if (!outcome.applied()) {
                sendRejected(
                        email,
                        scoreId,
                        request.opId(),
                        outcome.reason().name(),
                        outcome.seq(),
                        toMessages(outcome.measures()),
                        outcome.reason() == Reason.STALE ? live.document.fullXml() : null);
                return;
            }
            OpBroadcast broadcast = new OpBroadcast(
                    scoreId,
                    outcome.seq(),
                    request.opId(),
                    sessionId,
                    participant.memberId(),
                    toMessages(outcome.measures()),
                    outcome.structuralXml(),
                    outcome.structuralXml() == null ? null : live.document.hashes());
            persist(broadcast, participant.memberId(), now);
            live.lastOpAt = now;
            live.touchEditor(email, participant.name());
            locks.renew(scoreId, sessionId, now);
            messaging.convertAndSend(topic(scoreId, "ops"), broadcast);
        }
    }

    /** Lưu ngay thành version (người dùng bấm Lưu). */
    public void save(String scoreId, String sessionId) {
        requireEditor(scoreId, sessionId);
        flush(scoreId, false);
    }

    // ---------------------------------------------------------------- việc nền

    /**
     * Gọi định kỳ: bỏ người quá hạn nhịp tim, bỏ khóa hết hạn, lưu các phiên đã yên đủ lâu và dọn phiên mồ côi (không còn
     * ai sửa nhưng lần lưu cuối đã lỗi).
     */
    public void sweep() {
        Instant now = clock.instant();
        for (LiveSessionRegistry.Removed removed : registry.expire(now)) {
            afterRemoved(removed.scoreId(), removed.participant());
        }
        for (String scoreId : locks.expire(now)) {
            broadcastLocks(scoreId);
        }
        for (Map.Entry<String, Live> entry : lives.entrySet()) {
            String scoreId = entry.getKey();
            Live live = entry.getValue();
            if (registry.editorCount(scoreId) == 0) {
                flush(scoreId, true);
            } else if (live.document.hasUnsaved()
                    && Duration.between(live.lastOpAt, now).getSeconds() >= IDLE_SAVE_SECONDS) {
                flush(scoreId, false);
            }
        }
    }

    /** Xóa nhật ký thao tác cũ hơn 7 ngày. */
    public int purgeOldOps() {
        return opRepository.deleteCreatedBefore(LocalDateTime.now().minusDays(7));
    }

    // ---------------------------------------------------------------- nội bộ

    private Live open(String scoreId, String email) {
        Live existing = lives.get(scoreId);
        if (existing != null) {
            return existing;
        }
        // Đọc ngoài computeIfAbsent: không giữ khóa bảng băm trong lúc truy cập DB và đĩa
        ScoreContent content = security.runAs(email, () -> scoreContentService.getMusicXml(scoreId));
        long startSeq = opRepository.maxSeq(scoreId);
        Live created = new Live(LiveDocument.open(content.bytes(), content.version(), startSeq), clock.instant());
        Live winner = lives.putIfAbsent(scoreId, created);
        registry.markActive(scoreId);
        return winner != null ? winner : created;
    }

    private JoinResult joinResult(String scoreId, String sessionId, Live live, long lastSeq) {
        LiveDocument doc = live.document;
        synchronized (doc.lock()) {
            long seq = doc.seq();
            boolean replayable = lastSeq >= doc.startSeq() && lastSeq <= seq && seq - lastSeq <= MAX_REPLAY;
            if (!replayable) {
                return fullJoinResult(scoreId, sessionId, doc, seq);
            }
            List<OpBroadcast> missing = new ArrayList<>();
            if (seq > lastSeq) {
                for (ScoreLiveOp op : opRepository.findByScoreIdAndSeqGreaterThanOrderBySeqAsc(
                        scoreId, lastSeq, PageRequest.of(0, MAX_REPLAY + 1))) {
                    missing.add(readOp(op));
                }
                if (missing.size() != seq - lastSeq
                        || missing.stream().anyMatch(op -> op.structuralXml() != null)) {
                    // Nhật ký thiếu (ghi lỗi) hoặc có thao tác cấu trúc (không kèm mã băm): gửi cả bài
                    return fullJoinResult(scoreId, sessionId, doc, seq);
                }
            }
            return new JoinResult(scoreId, sessionId, true, seq, doc.baseVersion(), null, null, missing);
        }
    }

    private static JoinResult fullJoinResult(String scoreId, String sessionId, LiveDocument doc, long seq) {
        return new JoinResult(
                scoreId, sessionId, true, seq, doc.baseVersion(), doc.fullXml(), doc.hashes(), List.of());
    }

    private LiveParticipant requireEditor(String scoreId, String sessionId) {
        LiveParticipant participant = registry.find(scoreId, sessionId);
        if (participant == null || !participant.editing()) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
        return participant;
    }

    private void afterRemoved(String scoreId, LiveParticipant participant) {
        if (locks.releaseAll(scoreId, participant.sessionId())) {
            broadcastLocks(scoreId);
        }
        broadcastPresence(scoreId);
        if (registry.editorCount(scoreId) == 0) {
            flush(scoreId, true);
        }
    }

    /**
     * Lưu các thao tác chưa lưu thành version mới; {@code close} thì đóng phiên nếu đã lưu xong và không còn ai sửa. Thử
     * lần lượt từng người đã sửa (người mới nhất trước) vì quyền sửa của một người có thể vừa bị thu hồi.
     */
    void flush(String scoreId, boolean close) {
        Live live = lives.get(scoreId);
        if (live == null) {
            return;
        }
        LiveDocument doc = live.document;
        synchronized (doc.lock()) {
            if (doc.hasUnsaved() && !saveSnapshot(scoreId, live)) {
                return;
            }
            if (close && registry.editorCount(scoreId) == 0) {
                lives.remove(scoreId);
                registry.markIdle(scoreId);
                locks.clear(scoreId);
                messaging.convertAndSend(
                        topic(scoreId, "version"), new VersionBroadcast(scoreId, doc.baseVersion(), doc.seq(), true));
            }
        }
    }

    /** Lưu; trả true nếu đã lưu. Gọi khi đang giữ khóa của tài liệu. */
    private boolean saveSnapshot(String scoreId, Live live) {
        LiveDocument doc = live.document;
        byte[] bytes = doc.toBytes();
        long seqTo = doc.seq();
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("source", "LIVE");
        meta.put("editors", live.names());
        meta.put("seqFrom", doc.firstUnsavedSeq());
        meta.put("seqTo", seqTo);
        String ifMatch = "\"v" + doc.baseVersion() + "\"";
        for (String email : live.emailsNewestFirst()) {
            try {
                ScoreSaveResponse saved = security.runAs(
                        email, () -> scoreEditService.saveLiveSnapshot(scoreId, bytes, ifMatch, meta));
                doc.markSaved(seqTo, saved.getVersion());
                messaging.convertAndSend(
                        topic(scoreId, "version"), new VersionBroadcast(scoreId, saved.getVersion(), seqTo, false));
                return true;
            } catch (AppException e) {
                if (e.getErrorCode() == ErrorCode.SCORE_VERSION_CONFLICT) {
                    // Có version mới ngoài phiên: không còn lưu chồng lên được. Đóng phiên để mọi người tải lại.
                    log.error("Phiên cộng tác {} lệch version, đóng phiên", scoreId);
                    lives.remove(scoreId);
                    registry.markIdle(scoreId);
                    locks.clear(scoreId);
                    messaging.convertAndSend(
                            topic(scoreId, "version"), new VersionBroadcast(scoreId, doc.baseVersion(), seqTo, true));
                    return false;
                }
                log.warn("Không lưu được phiên cộng tác {} bằng quyền của {}: {}", scoreId, email, e.getMessage());
            }
        }
        return false;
    }

    private void validate(OpsRequest request) {
        boolean hasMeasures = request.measures() != null && !request.measures().isEmpty();
        boolean hasStructural = request.structural() != null && request.structural().afterXml() != null;
        if (request.opId() == null
                || request.opId().isBlank()
                || request.opId().length() > 36
                || hasMeasures == hasStructural) {
            throw new AppException(ErrorCode.LIVE_OP_INVALID);
        }
        if (hasStructural) {
            if (request.structural().afterXml().length() > MAX_STRUCTURAL_BYTES) {
                throw new AppException(ErrorCode.LIVE_OP_INVALID);
            }
            return;
        }
        int total = 0;
        for (MeasureChange change : request.measures()) {
            if (change == null || change.afterXml() == null || change.beforeHash() == null) {
                throw new AppException(ErrorCode.LIVE_OP_INVALID);
            }
            total += change.afterXml().length();
        }
        if (total > MAX_MEASURE_OP_BYTES || request.measures().size() > MAX_LOCK_KEYS) {
            throw new AppException(ErrorCode.LIVE_OP_INVALID);
        }
    }

    private List<Key> keysOf(Live live, List<MeasureRef> refs) {
        List<Integer> shape = live.document.shape();
        List<Key> keys = new ArrayList<>();
        if (refs == null) {
            return keys;
        }
        if (refs.size() > MAX_LOCK_KEYS) {
            throw new AppException(ErrorCode.LIVE_OP_INVALID);
        }
        for (MeasureRef ref : refs) {
            if (ref.partIndex() < 0
                    || ref.partIndex() >= shape.size()
                    || ref.measureIndex() < 0
                    || ref.measureIndex() >= shape.get(ref.partIndex())) {
                throw new AppException(ErrorCode.LIVE_OP_INVALID);
            }
            keys.add(new Key(ref.partIndex(), ref.measureIndex()));
        }
        return keys;
    }

    private static List<MeasureEdit> editsOf(List<MeasureChange> changes) {
        return changes.stream()
                .map(c -> new MeasureEdit(c.partIndex(), c.measureIndex(), c.beforeHash(), c.afterXml()))
                .toList();
    }

    private static List<LiveMessages.MeasureXml> toMessages(List<LiveDocument.MeasureXml> measures) {
        return measures.stream()
                .map(m -> new LiveMessages.MeasureXml(m.partIndex(), m.measureIndex(), m.xml(), m.hash()))
                .toList();
    }

    /** Nội dung hiện tại của các ô trong gói bị từ chối vì thiếu khóa, để người gửi tải lại. */
    private static List<LiveMessages.MeasureXml> currentOf(Live live, OpsRequest request) {
        if (request.measures() == null) {
            return List.of();
        }
        List<LiveMessages.MeasureXml> current = new ArrayList<>();
        for (MeasureChange change : request.measures()) {
            LiveDocument.MeasureXml measure = live.document.measure(change.partIndex(), change.measureIndex());
            if (measure != null) {
                current.add(new LiveMessages.MeasureXml(
                        measure.partIndex(), measure.measureIndex(), measure.xml(), measure.hash()));
            }
        }
        return current;
    }

    private void persist(OpBroadcast broadcast, String memberId, Instant now) {
        try {
            opRepository.save(ScoreLiveOp.builder()
                    .scoreId(broadcast.scoreId())
                    .seq(broadcast.seq())
                    .opId(broadcast.opId())
                    .memberId(memberId)
                    .payload(json.writeValueAsString(broadcast))
                    .createdAt(LocalDateTime.now(clock))
                    .build());
        } catch (JsonProcessingException | RuntimeException e) {
            // Tài liệu trong bộ nhớ vẫn đúng; chỉ mất khả năng phát lại thao tác này cho client kết nối lại
            log.warn("Không ghi được thao tác {} của bản {}: {}", broadcast.seq(), broadcast.scoreId(), e.getMessage());
        }
    }

    private OpBroadcast readOp(ScoreLiveOp op) {
        try {
            return json.readValue(op.getPayload(), OpBroadcast.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Thao tác %d của bản %s hỏng".formatted(op.getSeq(), op.getScoreId()), e);
        }
    }

    private void sendRejected(
            String email,
            String scoreId,
            String opId,
            String reason,
            long seq,
            List<LiveMessages.MeasureXml> measures,
            String structuralXml) {
        replyToUser(email, "/queue/live-rejected", new OpRejected(scoreId, opId, reason, seq, measures, structuralXml));
    }

    private void broadcastPresence(String scoreId) {
        List<LiveMessages.Participant> people =
                registry.participants(scoreId).stream().map(LiveParticipant::toMessage).toList();
        messaging.convertAndSend(topic(scoreId, "presence"), new PresenceBroadcast(scoreId, people));
    }

    private void broadcastLocks(String scoreId) {
        messaging.convertAndSend(topic(scoreId, "locks"), locks.snapshot(scoreId, clock.instant()));
    }

    private void replyToUser(String email, String queue, Object payload) {
        messaging.convertAndSendToUser(email, queue, payload);
    }

    private static String topic(String scoreId, String channel) {
        return "/topic/scores/" + scoreId + "/" + channel;
    }

    /** Tên các bản nhạc đang có phiên (cho kiểm thử và chẩn đoán). */
    Set<String> openScoreIds() {
        return Set.copyOf(lives.keySet());
    }
}
