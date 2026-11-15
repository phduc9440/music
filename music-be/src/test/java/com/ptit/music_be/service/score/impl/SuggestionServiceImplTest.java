package com.ptit.music_be.service.score.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.enums.notification.NotificationType;
import com.ptit.music_be.dto.enums.score.ScoreAccess;
import com.ptit.music_be.dto.enums.score.SuggestionChangeStatus;
import com.ptit.music_be.dto.enums.score.SuggestionSource;
import com.ptit.music_be.dto.enums.score.SuggestionStatus;
import com.ptit.music_be.dto.request.score.SuggestionDecisionRequest;
import com.ptit.music_be.dto.response.score.ScoreContent;
import com.ptit.music_be.dto.response.score.ScoreSaveResponse;
import com.ptit.music_be.dto.response.score.ScoreVersionConflict;
import com.ptit.music_be.dto.response.score.SuggestionDetailResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreSuggestion;
import com.ptit.music_be.entity.ScoreSuggestionChange;
import com.ptit.music_be.event.RewardEarnedEvent;
import com.ptit.music_be.event.RewardReason;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.ai.AiTaskRepository;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.score.MemberScoreRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.repository.score.ScoreSuggestionChangeRepository;
import com.ptit.music_be.repository.score.ScoreSuggestionRepository;
import com.ptit.music_be.service.notification.NotificationService;
import com.ptit.music_be.service.permission.AccessDecision;
import com.ptit.music_be.service.permission.ScorePermissionService;
import com.ptit.music_be.service.score.ScoreContentService;
import com.ptit.music_be.service.score.ScoreEditService;
import com.ptit.music_be.service.storage.FileStorageService;
import com.ptit.music_be.utils.MusicXmlInspector;

/**
 * Đề xuất sửa (mục 4.3), các ca SUG-1..13 của đặc tả. Bản nhạc 3 ô lấy từ {@code measure-hash/base.musicxml} (dạng đã lưu,
 * có DOCTYPE); bản gửi lên là bản đó đã bỏ DOCTYPE và sửa vài chỗ.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SuggestionServiceImplTest {

    static final String SCORE_ID = "score-1";
    static final String SUGGESTION_ID = "sug-1";
    static final String OWNER = "owner@mail.com";
    static final String AUTHOR = "author@mail.com";
    static final String EDITOR = "editor@mail.com";

    static String base;

    @Mock
    ScoreRepository scoreRepository;

    @Mock
    ScoreSuggestionRepository suggestionRepository;

    @Mock
    ScoreSuggestionChangeRepository changeRepository;

    @Mock
    MemberRepository memberRepository;

    @Mock
    MemberScoreRepository memberScoreRepository;

    @Mock
    AiTaskRepository aiTaskRepository;

    @Mock
    ScorePermissionService permissionService;

    @Mock
    ScoreEditService scoreEditService;

    @Mock
    ScoreContentService scoreContentService;

    @Mock
    FileStorageService fileStorageService;

    @Mock
    NotificationService notificationService;

    @Mock
    ApplicationEventPublisher eventPublisher;

    @TempDir
    Path storage;

    SuggestionServiceImpl service;
    Score score;
    Member owner;
    Member author;
    Member editor;
    AtomicInteger changeIds = new AtomicInteger();

    @BeforeAll
    static void loadSample() throws IOException {
        try (InputStream in = SuggestionServiceImplTest.class.getResourceAsStream("/measure-hash/base.musicxml")) {
            base = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    @BeforeEach
    void setUp() {
        service = new SuggestionServiceImpl(
                scoreRepository,
                suggestionRepository,
                changeRepository,
                memberRepository,
                memberScoreRepository,
                aiTaskRepository,
                permissionService,
                scoreEditService,
                scoreContentService,
                fileStorageService,
                notificationService,
                eventPublisher,
                new ObjectMapper(),
                1024 * 1024);
        owner = Member.builder().id("m-owner").email(OWNER).fullName("Chủ bản").build();
        author = Member.builder()
                .id("m-author")
                .email(AUTHOR)
                .fullName("Người đề xuất")
                .build();
        editor = Member.builder()
                .id("m-editor")
                .email(EDITOR)
                .fullName("Người sửa")
                .build();
        score = Score.builder()
                .id(SCORE_ID)
                .title("Bài thử")
                .member(owner)
                .currentVersion(3)
                .build();

        when(scoreRepository.findById(SCORE_ID)).thenReturn(Optional.of(score));
        for (Member m : List.of(owner, author, editor)) {
            when(memberRepository.findByEmail(m.getEmail())).thenReturn(Optional.of(m));
            when(memberRepository.findByEmailForUpdate(m.getEmail())).thenReturn(Optional.of(m));
        }
        when(permissionService.canEdit(eq(score), any()))
                .thenAnswer(inv -> ((AccessDecision) inv.getArgument(1)).can(ScoreAccess.EDIT));
        when(suggestionRepository.save(any())).thenAnswer(inv -> {
            ScoreSuggestion s = inv.getArgument(0);
            if (s.getId() == null) {
                s.setId(SUGGESTION_ID);
            }
            return s;
        });
        when(changeRepository.saveAll(any())).thenAnswer(inv -> {
            List<ScoreSuggestionChange> list = inv.getArgument(0);
            list.stream().filter(c -> c.getId() == null).forEach(c -> c.setId("c" + changeIds.getAndIncrement()));
            return list;
        });
        when(memberScoreRepository.findByScoreIdFetchMember(SCORE_ID)).thenReturn(List.of());
        when(scoreEditService.getVersionContent(SCORE_ID, 3)).thenReturn(content(base, 3));
        when(scoreContentService.getMusicXml(SCORE_ID)).thenReturn(content(base, 3));
        when(scoreEditService.saveWithMeta(eq(SCORE_ID), any(), anyString(), any()))
                .thenAnswer(inv -> {
                    score.setCurrentVersion(4);
                    return ScoreSaveResponse.builder().version(4).build();
                });
        when(fileStorageService.resolve(any())).thenAnswer(inv -> storage.resolve((String) inv.getArgument(0)));
        givenAccess(ScoreAccess.REVIEW);
        as(AUTHOR);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    // ---------------------------------------------------------------- dựng dữ liệu

    private static ScoreContent content(String xml, int version) {
        return new ScoreContent(xml.getBytes(StandardCharsets.UTF_8), version);
    }

    private static void as(String email) {
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(email, "x", "ROLE_USER"));
    }

    private void givenAccess(ScoreAccess level) {
        when(permissionService.resolve(score)).thenReturn(new AccessDecision(level, false, false));
    }

    /** Bản gửi lên: không DOCTYPE (Editor luôn bỏ). */
    private static String upload(String xml) {
        return xml.replaceFirst("<!DOCTYPE[^>]*>\\s*", "");
    }

    private static final String EDIT_MEASURE_1 = "<step>C</step><octave>4</octave>|<step>C</step><octave>5</octave>";
    private static final String EDIT_MEASURE_2 = "<step>D</step>|<step>F</step>";
    private static final String EDIT_MEASURE_3 = "<step>G</step>|<step>A</step>";

    private static String edited(String xml, String... edits) {
        String result = xml;
        for (String edit : edits) {
            String[] parts = edit.split("\\|");
            assertThat(result).contains(parts[0]);
            result = result.replace(parts[0], parts[1]);
        }
        return result;
    }

    private SuggestionDetailResponse send(String xml) {
        return service.create(
                SCORE_ID,
                new MockMultipartFile("file", "s.musicxml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)),
                3,
                "Đổi vài nốt",
                "Mô tả");
    }

    private ErrorCode errorOf(Supplier<?> action) {
        return catchThrowableOfType(AppException.class, action::get).getErrorCode();
    }

    /** Đề xuất đang mở như service lưu, tính từ chính bộ so sánh; ô được đánh số c0, c1... theo thứ tự. */
    private ScoreSuggestion openSuggestion(Member by, String proposedXml) {
        SuggestionDiffer.Result result = SuggestionDiffer.diff(
                MusicXmlInspector.parseStored(base.getBytes(StandardCharsets.UTF_8)),
                MusicXmlInspector.parseStored(upload(proposedXml).getBytes(StandardCharsets.UTF_8)));
        ScoreSuggestion suggestion = ScoreSuggestion.builder()
                .id(SUGGESTION_ID)
                .score(score)
                .author(by)
                .source(SuggestionSource.EDITOR)
                .baseVersion(3)
                .baseShape("{\"parts\":[\"P1\"],\"measures\":[3]}")
                .title("Đổi vài nốt")
                .status(SuggestionStatus.OPEN)
                .structural(result.structural())
                .storagePath("scores/score-1/suggestions/sug-1.musicxml")
                .build();
        List<ScoreSuggestionChange> changes = new ArrayList<>();
        for (SuggestionDiffer.MeasureChange c : result.changes()) {
            changes.add(ScoreSuggestionChange.builder()
                    .id("c" + changes.size())
                    .suggestion(suggestion)
                    .partIndex(c.partIndex())
                    .measureIndex(c.measureIndex())
                    .measureNumber(c.measureNumber())
                    .baseHash(c.baseHash())
                    .contextHash(c.contextHash())
                    .proposedXml(c.proposedXml())
                    .status(SuggestionChangeStatus.PENDING)
                    .build());
        }
        when(suggestionRepository.findByIdForUpdate(SUGGESTION_ID)).thenReturn(Optional.of(suggestion));
        when(suggestionRepository.findById(SUGGESTION_ID)).thenReturn(Optional.of(suggestion));
        when(changeRepository.findBySuggestion(SUGGESTION_ID)).thenReturn(changes);
        return suggestion;
    }

    private byte[] savedBody() {
        ArgumentCaptor<byte[]> body = ArgumentCaptor.forClass(byte[].class);
        verify(scoreEditService).saveWithMeta(eq(SCORE_ID), body.capture(), eq("\"v3\""), any());
        return body.getValue();
    }

    private static String text(byte[] bytes) {
        return new String(bytes, StandardCharsets.UTF_8);
    }

    // ---------------------------------------------------------------- gửi (SUG-1..4, 10, 11)

    /** SUG-1 */
    @Test
    void sendingEditedMeasuresCreatesPendingChangesAndNotifiesOwner() {
        SuggestionDetailResponse response = send(edited(upload(base), EDIT_MEASURE_1, EDIT_MEASURE_2, EDIT_MEASURE_3));

        assertThat(response.getStatus()).isEqualTo(SuggestionStatus.OPEN);
        assertThat(response.isStructural()).isFalse();
        assertThat(response.getChangeCount()).isEqualTo(3);
        assertThat(response.getChanges()).extracting(c -> c.getMeasureIndex()).containsExactly(0, 1, 2);
        assertThat(response.getChanges()).extracting(c -> c.getPartName()).containsOnly("Piano");
        assertThat(response.getChanges()).extracting(c -> c.getStatus()).containsOnly(SuggestionChangeStatus.PENDING);
        assertThat(response.isStale()).isFalse();
        assertThat(response.isCanWithdraw()).isTrue();
        assertThat(response.isCanDecide()).isFalse();
        verify(fileStorageService).store(any(), eq("scores/score-1/suggestions/sug-1.musicxml"));
        verify(notificationService)
                .notify(eq(owner), eq(author), eq(NotificationType.SUGGESTION_NEW), eq(SCORE_ID), anyString(), any());
    }

    /** SUG-2 */
    @Test
    void sendingTheBaseVersionUnchangedIsEmpty() {
        assertThat(errorOf(() -> send(upload(base)))).isEqualTo(ErrorCode.SUGGESTION_EMPTY);
        verify(suggestionRepository, never()).save(any());
    }

    /** SUG-3 */
    @Test
    void viewerCannotSend() {
        givenAccess(ScoreAccess.VIEW);

        assertThat(errorOf(() -> send(edited(upload(base), EDIT_MEASURE_2)))).isEqualTo(ErrorCode.UNAUTHORIZED);
    }

    /** SUG-4 */
    @Test
    void changingTimeSignatureIsStructuralWithoutChanges() {
        SuggestionDetailResponse response = send(edited(upload(base), "<beats>4</beats>|<beats>3</beats>"));

        assertThat(response.isStructural()).isTrue();
        assertThat(response.getChanges()).isEmpty();
    }

    /** SUG-10 */
    @Test
    void eleventhOpenSuggestionIsRejected() {
        when(suggestionRepository.countOpenOf(SCORE_ID, "m-author")).thenReturn(10L);

        assertThat(errorOf(() -> send(edited(upload(base), EDIT_MEASURE_2))))
                .isEqualTo(ErrorCode.SUGGESTION_TOO_MANY_OPEN);
    }

    @Test
    void thirtyFirstSuggestionInADayIsRateLimited() {
        when(suggestionRepository.countCreatedSince(eq("m-author"), any(LocalDateTime.class)))
                .thenReturn(30L);

        assertThat(errorOf(() -> send(edited(upload(base), EDIT_MEASURE_2))))
                .isEqualTo(ErrorCode.SUGGESTION_RATE_LIMITED);
    }

    /** SUG-11 */
    @Test
    void emptyOrTooLongTitleIsInvalid() {
        MockMultipartFile file = new MockMultipartFile(
                "file", "s.musicxml", "application/xml", upload(base).getBytes(StandardCharsets.UTF_8));

        assertThat(errorOf(() -> service.create(SCORE_ID, file, 3, "   ", null)))
                .isEqualTo(ErrorCode.SUGGESTION_FIELDS_INVALID);
        assertThat(errorOf(() -> service.create(SCORE_ID, file, 3, "x".repeat(201), null)))
                .isEqualTo(ErrorCode.SUGGESTION_FIELDS_INVALID);
        assertThat(errorOf(() -> service.create(SCORE_ID, file, 3, "Tiêu đề", "d".repeat(2001))))
                .isEqualTo(ErrorCode.SUGGESTION_FIELDS_INVALID);
    }

    @Test
    void unknownBaseVersionIsRejected() {
        MockMultipartFile file = new MockMultipartFile(
                "file", "s.musicxml", "application/xml", upload(base).getBytes(StandardCharsets.UTF_8));

        assertThat(errorOf(() -> service.create(SCORE_ID, file, 4, "Tiêu đề", null)))
                .isEqualTo(ErrorCode.SCORE_VERSION_NOT_EXISTED);
    }

    @Test
    void uploadWithDoctypeIsInvalid() {
        assertThat(errorOf(() -> send(base))).isEqualTo(ErrorCode.MUSICXML_INVALID);
    }

    // ---------------------------------------------------------------- nhận (SUG-5..9, 12, 13)

    /** SUG-5 */
    @Test
    void acceptingTwoOfThreeMeasuresCreatesPartialVersion() {
        ScoreSuggestion suggestion =
                openSuggestion(author, edited(upload(base), EDIT_MEASURE_1, EDIT_MEASURE_2, EDIT_MEASURE_3));
        givenAccess(ScoreAccess.EDIT);
        as(EDITOR);

        SuggestionDetailResponse response = service.accept(
                SUGGESTION_ID,
                "\"v3\"",
                SuggestionDecisionRequest.builder()
                        .changeIds(List.of("c0", "c2"))
                        .note("Ổn")
                        .build());

        String merged = text(savedBody());
        assertThat(merged)
                .contains("<octave>5</octave>")
                .contains("<step>A</step>")
                .contains("<step>D</step>")
                .doesNotContain("<step>F</step>")
                .doesNotContain("DOCTYPE");
        ArgumentCaptor<Map<String, Object>> meta = ArgumentCaptor.captor();
        verify(scoreEditService).saveWithMeta(eq(SCORE_ID), any(), eq("\"v3\""), meta.capture());
        assertThat(meta.getValue())
                .containsEntry("suggestionId", SUGGESTION_ID)
                .containsEntry("suggestionAuthorId", "m-author")
                .containsEntry("suggestionAuthorName", "Người đề xuất");

        assertThat(suggestion.getStatus()).isEqualTo(SuggestionStatus.PARTIAL);
        assertThat(suggestion.getAppliedVersion()).isEqualTo(4);
        assertThat(suggestion.getDecidedBy()).isEqualTo(editor);
        assertThat(suggestion.getDecisionNote()).isEqualTo("Ổn");
        assertThat(response.getChanges())
                .extracting(c -> c.getStatus())
                .containsExactly(
                        SuggestionChangeStatus.ACCEPTED,
                        SuggestionChangeStatus.REJECTED,
                        SuggestionChangeStatus.ACCEPTED);
        verify(notificationService)
                .notify(
                        eq(author),
                        eq(editor),
                        eq(NotificationType.SUGGESTION_DECIDED),
                        eq(SCORE_ID),
                        anyString(),
                        any());
    }

    @Test
    void acceptingAllWithoutIdsClosesAsAccepted() {
        ScoreSuggestion suggestion = openSuggestion(author, edited(upload(base), EDIT_MEASURE_2));
        givenAccess(ScoreAccess.EDIT);
        as(EDITOR);

        service.accept(SUGGESTION_ID, "\"v3\"", null);

        assertThat(suggestion.getStatus()).isEqualTo(SuggestionStatus.ACCEPTED);
        assertThat(text(savedBody())).contains("<step>F</step>");
    }

    /** SUG-6 */
    @Test
    void measureEditedByOwnerAfterwardsIsConflictAndAcceptingOverwritesIt() {
        openSuggestion(author, edited(upload(base), EDIT_MEASURE_2));
        when(scoreContentService.getMusicXml(SCORE_ID))
                .thenReturn(content(edited(base, "<step>D</step>|<step>B</step>"), 3));
        givenAccess(ScoreAccess.EDIT);
        as(EDITOR);

        SuggestionDetailResponse detail = service.get(SUGGESTION_ID);
        assertThat(detail.getChanges()).singleElement().satisfies(c -> {
            assertThat(c.getMeasureIndex()).isEqualTo(1);
            assertThat(c.isConflict()).isTrue();
        });
        assertThat(detail.isStale()).isFalse();

        service.accept(SUGGESTION_ID, "\"v3\"", null);

        assertThat(text(savedBody())).contains("<step>F</step>").doesNotContain("<step>B</step>");
    }

    /** SUG-7 */
    @Test
    void addedMeasureMakesSuggestionStaleSoAcceptFailsAndRejectMarksOutdated() {
        ScoreSuggestion suggestion = openSuggestion(author, edited(upload(base), EDIT_MEASURE_2));
        when(scoreContentService.getMusicXml(SCORE_ID))
                .thenReturn(content(
                        base.replace(
                                "</part>",
                                "<measure number=\"4\"><note><rest measure=\"yes\"/><duration>16</duration></note>"
                                        + "</measure></part>"),
                        3));
        givenAccess(ScoreAccess.EDIT);
        as(EDITOR);

        SuggestionDetailResponse detail = service.get(SUGGESTION_ID);
        assertThat(detail.isStale()).isTrue();
        assertThat(detail.getStaleReason()).isEqualTo(SuggestionServiceImpl.STALE_STRUCTURE);
        assertThat(errorOf(() -> service.accept(SUGGESTION_ID, "\"v3\"", null)))
                .isEqualTo(ErrorCode.SUGGESTION_OUTDATED);
        verify(scoreEditService, never()).saveWithMeta(any(), any(), any(), any());

        service.reject(SUGGESTION_ID, null);
        assertThat(suggestion.getStatus()).isEqualTo(SuggestionStatus.OUTDATED);
    }

    /** SUG-8 */
    @Test
    void reviewerCannotAcceptOwnSuggestion() {
        ScoreSuggestion suggestion = openSuggestion(author, edited(upload(base), EDIT_MEASURE_2));

        assertThat(errorOf(() -> service.accept(SUGGESTION_ID, "\"v3\"", null))).isEqualTo(ErrorCode.UNAUTHORIZED);
        assertThat(suggestion.getStatus()).isEqualTo(SuggestionStatus.OPEN);
    }

    /** SUG-9 */
    @Test
    void staleIfMatchIsVersionConflictAndChangesNothing() {
        ScoreSuggestion suggestion = openSuggestion(author, edited(upload(base), EDIT_MEASURE_2));
        givenAccess(ScoreAccess.EDIT);
        as(EDITOR);

        AppException error =
                catchThrowableOfType(AppException.class, () -> service.accept(SUGGESTION_ID, "\"v2\"", null));

        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.SCORE_VERSION_CONFLICT);
        assertThat(error.getPayload()).isEqualTo(new ScoreVersionConflict(3));
        assertThat(suggestion.getStatus()).isEqualTo(SuggestionStatus.OPEN);
        verify(scoreEditService, never()).saveWithMeta(any(), any(), any(), any());
    }

    /** SUG-12 */
    @Test
    void changedDivisionsMakeSuggestionStale() {
        openSuggestion(author, edited(upload(base), EDIT_MEASURE_2));
        when(scoreContentService.getMusicXml(SCORE_ID))
                .thenReturn(content(edited(base, "<divisions>4</divisions>|<divisions>8</divisions>"), 3));
        givenAccess(ScoreAccess.EDIT);
        as(EDITOR);

        SuggestionDetailResponse detail = service.get(SUGGESTION_ID);

        assertThat(detail.isStale()).isTrue();
        assertThat(detail.getStaleReason()).isEqualTo(SuggestionServiceImpl.STALE_CONTEXT);
        assertThat(errorOf(() -> service.accept(SUGGESTION_ID, "\"v3\"", null)))
                .isEqualTo(ErrorCode.SUGGESTION_OUTDATED);
    }

    /** SUG-13 */
    @Test
    void rewardGoesToAuthorOtherThanOwnerAndAcceptor() {
        openSuggestion(author, edited(upload(base), EDIT_MEASURE_2));
        givenAccess(ScoreAccess.EDIT);
        as(EDITOR);

        service.accept(SUGGESTION_ID, "\"v3\"", null);

        verify(eventPublisher)
                .publishEvent(new RewardEarnedEvent("m-author", RewardReason.SUGGESTION_ACCEPTED, SUGGESTION_ID));
    }

    @Test
    void ownersOwnSuggestionEarnsNoReward() {
        openSuggestion(owner, edited(upload(base), EDIT_MEASURE_2));
        givenAccess(ScoreAccess.OWNER);
        as(OWNER);

        service.accept(SUGGESTION_ID, "\"v3\"", null);

        verify(eventPublisher, never()).publishEvent(any(RewardEarnedEvent.class));
    }

    @Test
    void structuralSuggestionOnlyAcceptsEverythingFromItsFile() throws IOException {
        String proposal = edited(upload(base), "<beats>4</beats>|<beats>3</beats>");
        ScoreSuggestion suggestion = openSuggestion(author, proposal);
        Files.createDirectories(storage.resolve("scores/score-1/suggestions"));
        Files.writeString(storage.resolve(suggestion.getStoragePath()), proposal);
        givenAccess(ScoreAccess.EDIT);
        as(EDITOR);

        assertThat(errorOf(() -> service.accept(
                        SUGGESTION_ID,
                        "\"v3\"",
                        SuggestionDecisionRequest.builder()
                                .changeIds(List.of("c0"))
                                .build())))
                .isEqualTo(ErrorCode.SUGGESTION_CHANGES_INVALID);

        service.accept(SUGGESTION_ID, "\"v3\"", null);

        assertThat(text(savedBody())).isEqualTo(proposal);
        assertThat(suggestion.getStatus()).isEqualTo(SuggestionStatus.ACCEPTED);
    }

    @Test
    void emptyOrUnknownChangeIdsAreInvalid() {
        openSuggestion(author, edited(upload(base), EDIT_MEASURE_2));
        givenAccess(ScoreAccess.EDIT);
        as(EDITOR);

        assertThat(errorOf(() -> service.accept(
                        SUGGESTION_ID,
                        "\"v3\"",
                        SuggestionDecisionRequest.builder().changeIds(List.of()).build())))
                .isEqualTo(ErrorCode.SUGGESTION_CHANGES_INVALID);
        assertThat(errorOf(() -> service.accept(
                        SUGGESTION_ID,
                        "\"v3\"",
                        SuggestionDecisionRequest.builder()
                                .changeIds(List.of("other"))
                                .build())))
                .isEqualTo(ErrorCode.SUGGESTION_CHANGES_INVALID);
    }

    @Test
    void closedSuggestionCannotBeAcceptedAgain() {
        ScoreSuggestion suggestion = openSuggestion(author, edited(upload(base), EDIT_MEASURE_2));
        suggestion.setStatus(SuggestionStatus.REJECTED);
        givenAccess(ScoreAccess.EDIT);
        as(EDITOR);

        assertThat(errorOf(() -> service.accept(SUGGESTION_ID, "\"v3\"", null)))
                .isEqualTo(ErrorCode.SUGGESTION_NOT_OPEN);
    }

    // ---------------------------------------------------------------- từ chối, rút lại, xem

    @Test
    void rejectingMarksEveryChangeRejectedAndNotifiesAuthor() {
        ScoreSuggestion suggestion = openSuggestion(author, edited(upload(base), EDIT_MEASURE_1, EDIT_MEASURE_2));
        givenAccess(ScoreAccess.EDIT);
        as(EDITOR);

        SuggestionDetailResponse response = service.reject(
                SUGGESTION_ID,
                SuggestionDecisionRequest.builder().note("Chưa hợp").build());

        assertThat(suggestion.getStatus()).isEqualTo(SuggestionStatus.REJECTED);
        assertThat(suggestion.getDecisionNote()).isEqualTo("Chưa hợp");
        assertThat(response.getChanges()).extracting(c -> c.getStatus()).containsOnly(SuggestionChangeStatus.REJECTED);
        verify(notificationService)
                .notify(
                        eq(author),
                        eq(editor),
                        eq(NotificationType.SUGGESTION_DECIDED),
                        eq(SCORE_ID),
                        anyString(),
                        any());
        verify(scoreEditService, never()).saveWithMeta(any(), any(), any(), any());
    }

    @Test
    void authorCanWithdrawButAnotherEditorCannot() {
        ScoreSuggestion suggestion = openSuggestion(author, edited(upload(base), EDIT_MEASURE_2));
        givenAccess(ScoreAccess.EDIT);
        as(EDITOR);
        assertThat(errorOf(() -> {
                    service.withdraw(SUGGESTION_ID);
                    return null;
                }))
                .isEqualTo(ErrorCode.UNAUTHORIZED);

        as(AUTHOR);
        service.withdraw(SUGGESTION_ID);

        assertThat(suggestion.getStatus()).isEqualTo(SuggestionStatus.WITHDRAWN);
        assertThat(suggestion.getDecidedAt()).isNotNull();
    }

    @Test
    void reviewerDoesNotSeeSomeoneElsesSuggestion() {
        openSuggestion(editor, edited(upload(base), EDIT_MEASURE_2));
        as(AUTHOR);

        assertThat(errorOf(() -> service.get(SUGGESTION_ID))).isEqualTo(ErrorCode.SUGGESTION_NOT_EXISTED);
        assertThat(errorOf(() -> service.content(SUGGESTION_ID))).isEqualTo(ErrorCode.SUGGESTION_NOT_EXISTED);
    }

    @Test
    void contentOfCleanedSuggestionIsFileNotExisted() {
        ScoreSuggestion suggestion = openSuggestion(author, edited(upload(base), EDIT_MEASURE_2));
        suggestion.setStoragePath(null);

        assertThat(errorOf(() -> service.content(SUGGESTION_ID))).isEqualTo(ErrorCode.FILE_NOT_EXISTED);
    }

    // ---------------------------------------------------------------- dọn file

    @Test
    void cleanupDropsFilePathOfExpiredClosedSuggestions() {
        ScoreSuggestion expired = openSuggestion(author, edited(upload(base), EDIT_MEASURE_2));
        expired.setStatus(SuggestionStatus.REJECTED);
        when(suggestionRepository.findClosedWithFileBefore(any(), any(LocalDateTime.class)))
                .thenReturn(List.of(expired));
        String path = expired.getStoragePath();

        int cleaned = service.cleanupClosedFiles();

        assertThat(cleaned).isEqualTo(1);
        assertThat(expired.getStoragePath()).isNull();
        verify(fileStorageService).delete(path);
    }
}
