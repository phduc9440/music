package com.ptit.music_be.service.ai.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.enums.ai.AiTaskStatus;
import com.ptit.music_be.dto.enums.ai.AiTaskType;
import com.ptit.music_be.dto.enums.ai.ChordStyle;
import com.ptit.music_be.dto.enums.billing.PlanFeature;
import com.ptit.music_be.dto.enums.billing.RequestCap;
import com.ptit.music_be.dto.enums.billing.UsageMetric;
import com.ptit.music_be.dto.enums.score.ScoreAccess;
import com.ptit.music_be.dto.enums.score.SuggestionSource;
import com.ptit.music_be.dto.enums.score.SuggestionStatus;
import com.ptit.music_be.dto.request.ai.ChordSuggestionRequest;
import com.ptit.music_be.dto.response.ai.AiTaskResponse;
import com.ptit.music_be.dto.response.score.ScoreContent;
import com.ptit.music_be.entity.AiTask;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreSuggestion;
import com.ptit.music_be.event.ChordTaskCreatedEvent;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.code.AccountErrorCode;
import com.ptit.music_be.exception.code.AiErrorCode;
import com.ptit.music_be.exception.code.BillingErrorCode;
import com.ptit.music_be.exception.code.ScoreErrorCode;
import com.ptit.music_be.mapper.AiTaskMapper;
import com.ptit.music_be.repository.ai.AiTaskRepository;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.repository.score.ScoreSuggestionRepository;
import com.ptit.music_be.service.billing.EntitlementService;
import com.ptit.music_be.service.billing.PlanLimits;
import com.ptit.music_be.service.permission.AccessDecision;
import com.ptit.music_be.service.permission.ScorePermissionService;
import com.ptit.music_be.service.score.ScoreEditService;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ChordSuggestionServiceImplTest {

    static final String SCORE_ID = "score-1";
    static final String EMAIL = "me@mail.com";

    @Mock
    ScoreRepository scoreRepository;

    @Mock
    ScoreSuggestionRepository suggestionRepository;

    @Mock
    AiTaskRepository aiTaskRepository;

    @Mock
    MemberRepository memberRepository;

    @Mock
    ScorePermissionService permissionService;

    @Mock
    EntitlementService entitlementService;

    @Mock
    AiTaskMapper aiTaskMapper;

    @Mock
    ApplicationEventPublisher eventPublisher;

    ChordSuggestionServiceImpl service;
    Score score;
    Member me;
    final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        service = new ChordSuggestionServiceImpl(
                scoreRepository,
                suggestionRepository,
                aiTaskRepository,
                memberRepository,
                permissionService,
                entitlementService,
                aiTaskMapper,
                eventPublisher,
                objectMapper);
        me = Member.builder().id("m-1").email(EMAIL).build();
        score = Score.builder().id(SCORE_ID).title("Bài").currentVersion(7).build();
        when(scoreRepository.findById(SCORE_ID)).thenReturn(Optional.of(score));
        when(memberRepository.findByEmailForUpdate(EMAIL)).thenReturn(Optional.of(me));
        when(aiTaskRepository.save(any(AiTask.class))).thenAnswer(inv -> {
            AiTask task = inv.getArgument(0);
            task.setId("task-1");
            return task;
        });
        when(aiTaskMapper.toResponse(any())).thenAnswer(inv -> AiTaskResponse.builder()
                .id(((AiTask) inv.getArgument(0)).getId())
                .build());
        limits(null);
        access(ScoreAccess.EDIT);
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(EMAIL, "x", "ROLE_USER"));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    /** Gói của người bấm chỉ quy định số phương án; mọi hạn mức khác để trống (không giới hạn). */
    private void limits(Integer chordOptions) {
        when(entitlementService.limitsOf("m-1"))
                .thenReturn(new PlanLimits(
                        null, null, null, null, null, null, null, null, null, null, chordOptions, null, null, null));
    }

    private void access(ScoreAccess level) {
        AccessDecision decision = new AccessDecision(level, false, false);
        when(permissionService.resolve(score)).thenReturn(decision);
        when(permissionService.canEdit(score, decision)).thenReturn(decision.can(ScoreAccess.EDIT));
    }

    private static ChordSuggestionRequest style(String value) {
        ChordSuggestionRequest request = new ChordSuggestionRequest();
        request.setStyle(value);
        return request;
    }

    private AppException errorOf(String scoreId, String style) {
        return catchThrowableOfType(AppException.class, () -> service.request(scoreId, style(style)));
    }

    private void taskRunning(AiTaskType type) {
        when(aiTaskRepository.existsByScoreIdAndTaskTypeAndStatusIn(eq(SCORE_ID), eq(type), anyCollection()))
                .thenReturn(true);
    }

    @Test
    void unknownScoreIsRejected() {
        assertThat(errorOf("nope", "NATURAL").getErrorCode()).isEqualTo(ScoreErrorCode.SCORE_NOT_EXISTED);
    }

    @Test
    void viewerCannotRequest() {
        access(ScoreAccess.VIEW);
        assertThat(errorOf(SCORE_ID, "NATURAL").getErrorCode()).isEqualTo(AccountErrorCode.UNAUTHORIZED);
    }

    @Test
    void commenterCannotRequest() {
        access(ScoreAccess.COMMENT);
        assertThat(errorOf(SCORE_ID, "NATURAL").getErrorCode()).isEqualTo(AccountErrorCode.UNAUTHORIZED);
    }

    @Test
    void unknownStyleIsInvalid() {
        assertThat(errorOf(SCORE_ID, "ROCK").getErrorCode()).isEqualTo(AiErrorCode.CHORD_STYLE_INVALID);
    }

    @Test
    void missingStyleDefaultsToNaturalAndLegacyNamesMapToColours() {
        assertThat(ChordStyle.parse(null)).contains(ChordStyle.NATURAL);
        assertThat(ChordStyle.parse("pop")).contains(ChordStyle.NATURAL);
        assertThat(ChordStyle.parse("FOLK")).contains(ChordStyle.SIMPLE);
        assertThat(ChordStyle.parse("ballad")).contains(ChordStyle.COLORFUL);
        assertThat(ChordStyle.parse("BLUES")).contains(ChordStyle.JAZZY);
        assertThat(ChordStyle.parse("rock")).isEmpty();
    }

    @Test
    void scoreWithoutMusicXmlIsNotReady() {
        score.setCurrentVersion(null);
        assertThat(errorOf(SCORE_ID, "NATURAL").getErrorCode()).isEqualTo(ScoreErrorCode.MUSICXML_NOT_READY);
    }

    @Test
    void runningOmrMakesScoreBusy() {
        taskRunning(AiTaskType.OMR_CONVERSION);
        assertThat(errorOf(SCORE_ID, "NATURAL").getErrorCode()).isEqualTo(ScoreErrorCode.SCORE_BUSY);
    }

    @Test
    void secondRequestWhileTaskRunsIsRejected() {
        taskRunning(AiTaskType.CHORD_GENERATION);
        assertThat(errorOf(SCORE_ID, "NATURAL").getErrorCode()).isEqualTo(AiErrorCode.CHORD_TASK_RUNNING);
    }

    @Test
    void openChordSuggestionIsReportedWithItsId() {
        ScoreSuggestion open = ScoreSuggestion.builder().id("sug-9").build();
        when(suggestionRepository.findFirstByScoreIdAndSourceAndStatus(
                        SCORE_ID, SuggestionSource.CHORD_GENERATION, SuggestionStatus.OPEN))
                .thenReturn(Optional.of(open));

        AppException e = errorOf(SCORE_ID, "NATURAL");

        assertThat(e.getErrorCode()).isEqualTo(AiErrorCode.CHORD_SUGGESTION_PENDING);
        assertThat(e.getPayload()).isEqualTo(Map.of("suggestionId", "sug-9"));
    }

    @Test
    void quotaIsCheckedForTheRequester() {
        doThrow(new AppException(BillingErrorCode.PLAN_LIMIT_REACHED))
                .when(entitlementService)
                .checkAvailable(eq("m-1"), eq(UsageMetric.CHORD_GENERATIONS), anyInt());

        assertThat(errorOf(SCORE_ID, "NATURAL").getErrorCode()).isEqualTo(BillingErrorCode.PLAN_LIMIT_REACHED);
        verify(aiTaskRepository, never()).save(any());
    }

    @Test
    void reviewerCreatesPendingTaskAndEvent() throws Exception {
        AiTaskResponse response = service.request(SCORE_ID, style("jazzy"));

        assertThat(response.getId()).isEqualTo("task-1");
        ArgumentCaptor<AiTask> saved = ArgumentCaptor.forClass(AiTask.class);
        verify(aiTaskRepository).save(saved.capture());
        AiTask task = saved.getValue();
        assertThat(task.getTaskType()).isEqualTo(AiTaskType.CHORD_GENERATION);
        assertThat(task.getStatus()).isEqualTo(AiTaskStatus.PENDING);
        assertThat(task.getMember()).isSameAs(me);
        assertThat(task.getScore()).isSameAs(score);
        JsonNode input = objectMapper.readTree(task.getInputData());
        assertThat(input.path("style").asText()).isEqualTo("JAZZY");
        assertThat(input.path("creativity").asText()).isEqualTo("BALANCED");
        assertThat(input.path("density").asText()).isEqualTo("NORMAL");
        assertThat(input.path("baseVersion").asInt()).isEqualTo(7);
        verify(entitlementService).checkAvailable("m-1", UsageMetric.CHORD_GENERATIONS, 1);
        verify(eventPublisher).publishEvent(new ChordTaskCreatedEvent("task-1", SCORE_ID));
    }

    @Test
    void creativityAndDensityAreStoredAndValidated() throws Exception {
        ChordSuggestionRequest request = style("NATURAL");
        request.setCreativity("bold");
        request.setDensity("sparse");
        service.request(SCORE_ID, request);
        ArgumentCaptor<AiTask> saved = ArgumentCaptor.forClass(AiTask.class);
        verify(aiTaskRepository).save(saved.capture());
        JsonNode input = objectMapper.readTree(saved.getValue().getInputData());
        assertThat(input.path("creativity").asText()).isEqualTo("BOLD");
        assertThat(input.path("density").asText()).isEqualTo("SPARSE");

        ChordSuggestionRequest bad = style("NATURAL");
        bad.setCreativity("wild");
        assertThat(catchThrowableOfType(AppException.class, () -> service.request(SCORE_ID, bad))
                        .getErrorCode())
                .isEqualTo(AiErrorCode.CHORD_STYLE_INVALID);
    }

    @Test
    void chosenMelodyPartAndStaffAreStoredAndValidated() throws Exception {
        ChordSuggestionRequest request = style("NATURAL");
        request.setPartIndex(1);
        request.setStaff(2);
        service.request(SCORE_ID, request);
        JsonNode input = savedInput();
        assertThat(input.path("partIndex").asInt()).isEqualTo(1);
        assertThat(input.path("staff").asInt()).isEqualTo(2);

        ChordSuggestionRequest bad = style("NATURAL");
        bad.setStaff(0);
        assertThat(catchThrowableOfType(AppException.class, () -> service.request(SCORE_ID, bad))
                        .getErrorCode())
                .isEqualTo(AiErrorCode.CHORD_STYLE_INVALID);
    }

    private JsonNode savedInput() throws Exception {
        ArgumentCaptor<AiTask> saved = ArgumentCaptor.forClass(AiTask.class);
        verify(aiTaskRepository).save(saved.capture());
        return objectMapper.readTree(saved.getValue().getInputData());
    }

    @Test
    void basicOptionsDoNotNeedTheAdvancedFeature() {
        ChordSuggestionRequest request = style("SIMPLE");
        request.setCreativity("SAFE");
        request.setDensity("SPARSE");
        service.request(SCORE_ID, request);

        verify(entitlementService, never()).checkFeature(any(), any());
    }

    @Test
    void eachAdvancedOptionNeedsTheAdvancedFeature() {
        ChordSuggestionRequest colour = style("COLORFUL");
        ChordSuggestionRequest bold = style("NATURAL");
        bold.setCreativity("BOLD");
        ChordSuggestionRequest dense = style("NATURAL");
        dense.setDensity("DENSE");
        for (ChordSuggestionRequest request : java.util.List.of(colour, bold, dense)) {
            org.mockito.Mockito.clearInvocations(entitlementService);
            service.request(SCORE_ID, request);
            verify(entitlementService).checkFeature("m-1", PlanFeature.CHORD_ADVANCED);
        }
    }

    @Test
    void advancedOptionWithoutFeatureIsRejectedBeforeAnyQuotaIsUsed() {
        doThrow(new AppException(BillingErrorCode.PLAN_LIMIT_REACHED))
                .when(entitlementService)
                .checkFeature("m-1", PlanFeature.CHORD_ADVANCED);

        assertThat(errorOf(SCORE_ID, "JAZZY").getErrorCode()).isEqualTo(BillingErrorCode.PLAN_LIMIT_REACHED);
        verify(entitlementService, never()).checkAvailable(any(), any(), anyInt());
        verify(aiTaskRepository, never()).save(any());
    }

    @Test
    void measureCountIsCheckedAgainstThePlan() {
        score.setMeasureCount(120);
        doThrow(new AppException(BillingErrorCode.PLAN_LIMIT_REACHED))
                .when(entitlementService)
                .checkRequestCap("m-1", RequestCap.CHORD_MEASURES, 120);

        assertThat(errorOf(SCORE_ID, "NATURAL").getErrorCode()).isEqualTo(BillingErrorCode.PLAN_LIMIT_REACHED);
        verify(aiTaskRepository, never()).save(any());
    }

    @Test
    void missingMeasureCountIsCountedFromTheCurrentVersion() {
        ScoreEditService scoreEditService = org.mockito.Mockito.mock(ScoreEditService.class);
        String xml = "<score-partwise><part-list><score-part id=\"P1\"/></part-list><part id=\"P1\">"
                + "<measure number=\"1\"/><measure number=\"2\"/><measure number=\"3\"/></part></score-partwise>";
        when(scoreEditService.getVersionContentForSystem(SCORE_ID, 7))
                .thenReturn(new ScoreContent(xml.getBytes(java.nio.charset.StandardCharsets.UTF_8), 7));
        service.setScoreEditService(scoreEditService);

        service.request(SCORE_ID, style("NATURAL"));

        verify(entitlementService).checkRequestCap("m-1", RequestCap.CHORD_MEASURES, 3);
        assertThat(score.getMeasureCount()).isEqualTo(3);
    }

    @Test
    void unknownMeasureCountSkipsTheCap() {
        service.request(SCORE_ID, style("NATURAL"));

        verify(entitlementService, never()).checkRequestCap(any(), any(), anyInt());
    }

    @Test
    void optionCountComesFromThePlan() throws Exception {
        limits(1);
        service.request(SCORE_ID, style("NATURAL"));

        assertThat(savedInput().path("options").asInt()).isEqualTo(1);
    }

    @Test
    void missingOptionCountMeansTheMaximum() throws Exception {
        service.request(SCORE_ID, style("NATURAL"));

        assertThat(savedInput().path("options").asInt()).isEqualTo(PlanLimits.MAX_CHORD_OPTIONS);
    }
}
