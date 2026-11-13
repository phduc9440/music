package com.ptit.music_be.service.collab.live;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;
import org.springframework.messaging.simp.SimpMessagingTemplate;

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
import com.ptit.music_be.service.collab.live.LiveMessages.StructuralChange;
import com.ptit.music_be.service.collab.live.LiveMessages.VersionBroadcast;
import com.ptit.music_be.service.score.ScoreContentService;
import com.ptit.music_be.service.score.ScoreEditService;
import com.ptit.music_be.utils.MeasureHasher;
import com.ptit.music_be.utils.MusicXmlInspector;

@ExtendWith(MockitoExtension.class)
class LiveCollabServiceTest {

    private static final String SCORE = "score-1";
    private static final String OWNER = "owner@mail.com";
    private static final String GUEST = "guest@mail.com";

    private static final String MEASURE_1 = "<measure number=\"1\"><attributes><divisions>1</divisions>"
            + "<time><beats>4</beats><beat-type>4</beat-type></time></attributes>" + note("C") + "</measure>";
    private static final String MEASURE_2 = "<measure number=\"2\">" + note("D") + "</measure>";
    private static final String XML = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><score-partwise version=\"4.0\">"
            + "<part-list><score-part id=\"P1\"><part-name>Piano</part-name></score-part></part-list>"
            + "<part id=\"P1\">" + MEASURE_1 + MEASURE_2 + "</part></score-partwise>";

    private static String note(String step) {
        return "<note><pitch><step>" + step + "</step><octave>4</octave></pitch><duration>4</duration>"
                + "<type>whole</type></note>";
    }

    private static String hashOf(String measureXml) {
        return MeasureHasher.hash(MusicXmlInspector.parseStored(measureXml.getBytes(StandardCharsets.UTF_8))
                .getDocumentElement());
    }

    /** Đồng hồ chạy tay để thử hết hạn nhịp tim và lưu khi yên. */
    private static final class TestClock extends Clock {
        Instant now = Instant.parse("2026-11-13T10:00:00Z");

        @Override
        public ZoneOffset getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    @Mock
    LiveAccess access;

    @Mock
    LiveSecurity security;

    @Mock
    ScoreContentService scoreContentService;

    @Mock
    ScoreEditService scoreEditService;

    @Mock
    ScoreLiveOpRepository opRepository;

    @Mock
    SimpMessagingTemplate messaging;

    final LiveSessionRegistry registry = new LiveSessionRegistry();
    final MeasureLockManager locks = new MeasureLockManager();
    final TestClock clock = new TestClock();
    LiveCollabService service;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        service = new LiveCollabService(
                registry,
                locks,
                access,
                security,
                scoreContentService,
                scoreEditService,
                opRepository,
                messaging,
                new ObjectMapper(),
                clock);
        lenient().when(access.resolve(eq(OWNER), eq(SCORE))).thenReturn(new Access(SCORE, "m-owner", "m-owner", "Owner", true));
        lenient().when(access.resolve(eq(GUEST), eq(SCORE))).thenReturn(new Access(SCORE, "m-owner", "m-guest", "Guest", true));
        lenient().when(security.runAs(any(String.class), any(Supplier.class))).thenAnswer(inv -> ((Supplier<?>) inv.getArgument(1)).get());
        lenient().when(scoreContentService.getMusicXml(SCORE)).thenReturn(new ScoreContent(XML.getBytes(StandardCharsets.UTF_8), 3));
        lenient().when(opRepository.maxSeq(SCORE)).thenReturn(0L);
        lenient().when(opRepository.save(any(ScoreLiveOp.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    private JoinResult join(String session, String email, long lastSeq) {
        service.join(SCORE, session, email, new JoinRequest(true, lastSeq, null));
        ArgumentCaptor<Object> payload = ArgumentCaptor.forClass(Object.class);
        verify(messaging, org.mockito.Mockito.atLeastOnce()).convertAndSendToUser(eq(email), eq("/queue/live-join"), payload.capture());
        return (JoinResult) payload.getValue();
    }

    private void lock(String session, String email, MeasureRef... refs) {
        service.lock(SCORE, session, email, new LockRequest(List.of(refs), false, false));
    }

    private OpsRequest edit(String opId, long baseSeq, String before, String after) {
        return new OpsRequest(opId, baseSeq, List.of(new MeasureChange(0, 1, hashOf(before), after)), null);
    }

    @Test
    void firstEditorGetsTheWholeScoreAndLaterOnesGetOnlyMissingOps() {
        JoinResult first = join("A", OWNER, -1);
        assertThat(first.xml()).contains("<step>D</step>");
        assertThat(first.seq()).isZero();
        assertThat(first.baseVersion()).isEqualTo(3);
        assertThat(registry.isActive(SCORE)).isTrue();

        lock("A", OWNER, new MeasureRef(0, 1));
        service.ops(SCORE, "A", OWNER, edit("op-1", 0, MEASURE_2, "<measure number=\"2\">" + note("E") + "</measure>"));
        ArgumentCaptor<ScoreLiveOp> stored = ArgumentCaptor.forClass(ScoreLiveOp.class);
        verify(opRepository).save(stored.capture());
        when(opRepository.findByScoreIdAndSeqGreaterThanOrderBySeqAsc(eq(SCORE), eq(0L), any(Pageable.class)))
                .thenReturn(List.of(stored.getValue()));

        JoinResult second = join("B", GUEST, 0);
        assertThat(second.xml()).isNull();
        assertThat(second.seq()).isEqualTo(1);
        assertThat(second.ops()).hasSize(1);
        assertThat(second.ops().get(0).opId()).isEqualTo("op-1");
        assertThat(second.ops().get(0).measures().get(0).xml()).contains("<step>E</step>");
    }

    @Test
    void acceptedOpIsLoggedAndBroadcastWithSeq() {
        join("A", OWNER, -1);
        lock("A", OWNER, new MeasureRef(0, 1));

        service.ops(SCORE, "A", OWNER, edit("op-1", 0, MEASURE_2, "<measure number=\"2\">" + note("E") + "</measure>"));

        ArgumentCaptor<Object> sent = ArgumentCaptor.forClass(Object.class);
        verify(messaging).convertAndSend(eq("/topic/scores/" + SCORE + "/ops"), sent.capture());
        OpBroadcast broadcast = (OpBroadcast) sent.getValue();
        assertThat(broadcast.seq()).isEqualTo(1);
        assertThat(broadcast.sessionId()).isEqualTo("A");
        assertThat(broadcast.measures().get(0).xml()).contains("<step>E</step>");
        verify(opRepository).save(argThat((ScoreLiveOp op) -> op.getSeq() == 1 && op.getOpId().equals("op-1")));
    }

    @Test
    void opWithoutTheLockIsRejectedAndNothingChanges() {
        join("A", OWNER, -1);

        service.ops(SCORE, "A", OWNER, edit("op-1", 0, MEASURE_2, "<measure number=\"2\">" + note("E") + "</measure>"));

        OpRejected rejected = lastRejected(OWNER);
        assertThat(rejected.reason()).isEqualTo("LOCK_REQUIRED");
        assertThat(rejected.measures().get(0).xml()).contains("<step>D</step>");
        verify(messaging, never()).convertAndSend(eq("/topic/scores/" + SCORE + "/ops"), any(Object.class));
    }

    @Test
    void secondEditorCannotLockOrSendForAMeasureTheFirstHolds() {
        join("A", OWNER, -1);
        join("B", GUEST, -1);
        lock("A", OWNER, new MeasureRef(0, 1));

        lock("B", GUEST, new MeasureRef(0, 1));
        ArgumentCaptor<Object> payload = ArgumentCaptor.forClass(Object.class);
        verify(messaging, org.mockito.Mockito.atLeastOnce()).convertAndSendToUser(eq(GUEST), eq("/queue/live-locks"), payload.capture());
        LockResult result = (LockResult) payload.getValue();
        assertThat(result.granted()).isFalse();
        assertThat(result.heldBy()).isEqualTo("A");
        assertThat(result.heldByName()).isEqualTo("Owner");

        service.ops(SCORE, "B", GUEST, edit("op-b", 0, MEASURE_2, "<measure number=\"2\">" + note("G") + "</measure>"));
        assertThat(lastRejected(GUEST).reason()).isEqualTo("LOCK_REQUIRED");
    }

    @Test
    void staleBeforeHashGivesConflictWithCurrentMeasure() {
        join("A", OWNER, -1);
        lock("A", OWNER, new MeasureRef(0, 1));
        service.ops(SCORE, "A", OWNER, edit("op-1", 0, MEASURE_2, "<measure number=\"2\">" + note("E") + "</measure>"));

        // Gửi lại với hash của bản cũ (như thể chưa nhận được op-1)
        service.ops(SCORE, "A", OWNER, edit("op-2", 0, MEASURE_2, "<measure number=\"2\">" + note("F") + "</measure>"));

        OpRejected rejected = lastRejected(OWNER);
        assertThat(rejected.reason()).isEqualTo("CONFLICT");
        assertThat(rejected.measures().get(0).xml()).contains("<step>E</step>");
    }

    @Test
    void structuralNeedsTheWholeLock() {
        join("A", OWNER, -1);
        OpsRequest structural = new OpsRequest("s-1", 0, null, new StructuralChange(XML.replace("<beats>4", "<beats>3")));

        service.ops(SCORE, "A", OWNER, structural);
        assertThat(lastRejected(OWNER).reason()).isEqualTo("LOCK_REQUIRED");

        service.lock(SCORE, "A", OWNER, new LockRequest(List.of(), true, false));
        service.ops(SCORE, "A", OWNER, structural);
        verify(messaging).convertAndSend(eq("/topic/scores/" + SCORE + "/ops"), argThat((Object o) -> o instanceof OpBroadcast b && b.structuralXml() != null));
    }

    @Test
    void invalidOpsAndRateLimitAreRefused() {
        join("A", OWNER, -1);
        lock("A", OWNER, new MeasureRef(0, 1));

        assertThatThrownBy(() -> service.ops(SCORE, "A", OWNER, new OpsRequest("", 0, List.of(), null)))
                .isInstanceOfSatisfying(AppException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.LIVE_OP_INVALID));
        assertThatThrownBy(() -> service.ops(SCORE, "ghost", OWNER, edit("x", 0, MEASURE_2, MEASURE_2)))
                .isInstanceOfSatisfying(AppException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.UNAUTHORIZED));
        for (int i = 0; i < LiveCollabService.MAX_OPS_PER_SECOND; i++) {
            service.ops(SCORE, "A", OWNER, edit("dup-" + i, 0, MEASURE_2, "<measure number=\"2\">" + note("A") + "</measure>"));
        }
        assertThatThrownBy(() -> service.ops(SCORE, "A", OWNER, edit("over", 0, MEASURE_2, MEASURE_2)))
                .isInstanceOfSatisfying(AppException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.LIVE_RATE_LIMITED));
    }

    @Test
    void viewerWithoutEditRightsCannotJoinAndFullSessionRefusesTheEleventh() {
        when(access.resolve("viewer@mail.com", SCORE)).thenReturn(new Access(SCORE, "m-owner", "m-v", "V", false));
        assertThatThrownBy(() -> service.join(SCORE, "V", "viewer@mail.com", new JoinRequest(true, -1, null)))
                .isInstanceOfSatisfying(AppException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.UNAUTHORIZED));

        for (int i = 0; i < LiveSessionRegistry.MAX_EDITORS; i++) {
            join("S" + i, OWNER, -1);
        }
        assertThatThrownBy(() -> service.join(SCORE, "late", GUEST, new JoinRequest(true, -1, null)))
                .isInstanceOfSatisfying(AppException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.LIVE_SESSION_FULL));
        assertThat(registry.find(SCORE, "late")).isNull();
    }

    @Test
    void savesAVersionAfterThirtySecondsOfSilenceAndOnLastLeave() {
        when(scoreEditService.saveLiveSnapshot(eq(SCORE), any(byte[].class), eq("\"v3\""), any()))
                .thenReturn(ScoreSaveResponse.builder().version(4).build());
        join("A", OWNER, -1);
        lock("A", OWNER, new MeasureRef(0, 1));
        service.ops(SCORE, "A", OWNER, edit("op-1", 0, MEASURE_2, "<measure number=\"2\">" + note("E") + "</measure>"));

        clock.now = clock.now.plus(Duration.ofSeconds(10));
        service.sweep();
        verify(scoreEditService, never()).saveLiveSnapshot(any(), any(), any(), any());

        clock.now = clock.now.plus(Duration.ofSeconds(25));
        registry.upsert(SCORE, "A", OWNER, "m-owner", "Owner", true, null, clock.now);
        service.sweep();

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> meta = ArgumentCaptor.forClass(Map.class);
        verify(scoreEditService).saveLiveSnapshot(eq(SCORE), any(byte[].class), eq("\"v3\""), meta.capture());
        assertThat(meta.getValue()).containsEntry("source", "LIVE").containsEntry("seqFrom", 1L).containsEntry("seqTo", 1L);
        assertThat((List<?>) meta.getValue().get("editors")).containsExactly("Owner");
        verify(messaging).convertAndSend(eq("/topic/scores/" + SCORE + "/version"), eq(new VersionBroadcast(SCORE, 4, 1, false)));

        // Người cuối rời: không còn gì chưa lưu nên chỉ đóng phiên
        service.leave(SCORE, "A");
        assertThat(registry.isActive(SCORE)).isFalse();
        assertThat(service.openScoreIds()).isEmpty();
    }

    @Test
    void lastEditorLeavingFlushesUnsavedWorkAndClosesTheSession() {
        when(scoreEditService.saveLiveSnapshot(eq(SCORE), any(byte[].class), any(), any()))
                .thenReturn(ScoreSaveResponse.builder().version(4).build());
        join("A", OWNER, -1);
        lock("A", OWNER, new MeasureRef(0, 1));
        service.ops(SCORE, "A", OWNER, edit("op-1", 0, MEASURE_2, "<measure number=\"2\">" + note("E") + "</measure>"));

        service.leave(SCORE, "A");

        verify(scoreEditService).saveLiveSnapshot(eq(SCORE), any(byte[].class), eq("\"v3\""), any());
        assertThat(registry.isActive(SCORE)).isFalse();
        assertThat(locks.snapshot(SCORE, clock.now).locks()).isEmpty();
    }

    @Test
    void failedSaveKeepsTheSessionSoNothingIsLost() {
        when(scoreEditService.saveLiveSnapshot(eq(SCORE), any(byte[].class), any(), any()))
                .thenThrow(new AppException(ErrorCode.SCORE_BUSY));
        join("A", OWNER, -1);
        lock("A", OWNER, new MeasureRef(0, 1));
        service.ops(SCORE, "A", OWNER, edit("op-1", 0, MEASURE_2, "<measure number=\"2\">" + note("E") + "</measure>"));

        service.leave(SCORE, "A");

        assertThat(registry.isActive(SCORE)).isTrue();
        assertThat(service.openScoreIds()).containsExactly(SCORE);
    }

    @Test
    void reconnectWithOlderThanStartSeqReloadsEverything() {
        when(opRepository.maxSeq(SCORE)).thenReturn(40L);

        JoinResult result = join("A", OWNER, 12);

        assertThat(result.xml()).isNotNull();
        assertThat(result.seq()).isEqualTo(40);
        verify(opRepository, never()).findByScoreIdAndSeqGreaterThanOrderBySeqAsc(any(), anyLong(), any(Pageable.class));
    }

    @Test
    void disconnectReleasesLocksAndRemovesPresence() {
        join("A", OWNER, -1);
        join("B", GUEST, -1);
        lock("A", OWNER, new MeasureRef(0, 1));

        service.onDisconnect(disconnectOf("A"));

        assertThat(registry.find(SCORE, "A")).isNull();
        assertThat(locks.snapshot(SCORE, clock.now).locks()).isEmpty();
        assertThat(registry.isActive(SCORE)).isTrue();
    }

    private OpRejected lastRejected(String email) {
        ArgumentCaptor<Object> payload = ArgumentCaptor.forClass(Object.class);
        verify(messaging, org.mockito.Mockito.atLeastOnce()).convertAndSendToUser(eq(email), eq("/queue/live-rejected"), payload.capture());
        return (OpRejected) payload.getValue();
    }

    private static org.springframework.web.socket.messaging.SessionDisconnectEvent disconnectOf(String sessionId) {
        return new org.springframework.web.socket.messaging.SessionDisconnectEvent(
                "src",
                org.springframework.messaging.support.MessageBuilder.createMessage(new byte[0], new org.springframework.messaging.MessageHeaders(Map.of())),
                sessionId,
                org.springframework.web.socket.CloseStatus.NORMAL);
    }
}
