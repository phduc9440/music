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
import com.ptit.music_be.dto.enums.billing.UsageMetric;
import com.ptit.music_be.dto.enums.score.ScoreAccess;
import com.ptit.music_be.dto.enums.score.SuggestionSource;
import com.ptit.music_be.dto.enums.score.SuggestionStatus;
import com.ptit.music_be.dto.request.ai.ChordSuggestionRequest;
import com.ptit.music_be.dto.response.ai.AiTaskResponse;
import com.ptit.music_be.entity.AiTask;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreSuggestion;
import com.ptit.music_be.event.ChordTaskCreatedEvent;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.mapper.AiTaskMapper;
import com.ptit.music_be.repository.ai.AiTaskRepository;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.repository.score.ScoreSuggestionRepository;
import com.ptit.music_be.service.billing.EntitlementService;
import com.ptit.music_be.service.permission.AccessDecision;
import com.ptit.music_be.service.permission.ScorePermissionService;

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
        access(ScoreAccess.REVIEW);
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(EMAIL, "x", "ROLE_USER"));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private void access(ScoreAccess level) {
        when(permissionService.resolve(score)).thenReturn(new AccessDecision(level, false, false));
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
        assertThat(errorOf("nope", "POP").getErrorCode()).isEqualTo(ErrorCode.SCORE_NOT_EXISTED);
    }

    @Test
    void viewerCannotRequest() {
        access(ScoreAccess.VIEW);
        assertThat(errorOf(SCORE_ID, "POP").getErrorCode()).isEqualTo(ErrorCode.UNAUTHORIZED);
    }

    @Test
    void unknownOrMissingStyleIsInvalid() {
        assertThat(errorOf(SCORE_ID, "ROCK").getErrorCode()).isEqualTo(ErrorCode.CHORD_STYLE_INVALID);
        assertThat(errorOf(SCORE_ID, null).getErrorCode()).isEqualTo(ErrorCode.CHORD_STYLE_INVALID);
    }

    @Test
    void scoreWithoutMusicXmlIsNotReady() {
        score.setCurrentVersion(null);
        assertThat(errorOf(SCORE_ID, "POP").getErrorCode()).isEqualTo(ErrorCode.MUSICXML_NOT_READY);
    }

    @Test
    void runningOmrMakesScoreBusy() {
        taskRunning(AiTaskType.OMR_CONVERSION);
        assertThat(errorOf(SCORE_ID, "POP").getErrorCode()).isEqualTo(ErrorCode.SCORE_BUSY);
    }

    @Test
    void secondRequestWhileTaskRunsIsRejected() {
        taskRunning(AiTaskType.CHORD_GENERATION);
        assertThat(errorOf(SCORE_ID, "POP").getErrorCode()).isEqualTo(ErrorCode.CHORD_TASK_RUNNING);
    }

    @Test
    void openChordSuggestionIsReportedWithItsId() {
        ScoreSuggestion open = ScoreSuggestion.builder().id("sug-9").build();
        when(suggestionRepository.findFirstByScoreIdAndSourceAndStatus(
                        SCORE_ID, SuggestionSource.CHORD_GENERATION, SuggestionStatus.OPEN))
                .thenReturn(Optional.of(open));

        AppException e = errorOf(SCORE_ID, "POP");

        assertThat(e.getErrorCode()).isEqualTo(ErrorCode.CHORD_SUGGESTION_PENDING);
        assertThat(e.getPayload()).isEqualTo(Map.of("suggestionId", "sug-9"));
    }

    @Test
    void quotaIsCheckedForTheRequester() {
        doThrow(new AppException(ErrorCode.PLAN_LIMIT_REACHED))
                .when(entitlementService)
                .checkAvailable(eq("m-1"), eq(UsageMetric.CHORD_GENERATIONS), anyInt());

        assertThat(errorOf(SCORE_ID, "POP").getErrorCode()).isEqualTo(ErrorCode.PLAN_LIMIT_REACHED);
        verify(aiTaskRepository, never()).save(any());
    }

    @Test
    void reviewerCreatesPendingTaskAndEvent() throws Exception {
        AiTaskResponse response = service.request(SCORE_ID, style("jazz"));

        assertThat(response.getId()).isEqualTo("task-1");
        ArgumentCaptor<AiTask> saved = ArgumentCaptor.forClass(AiTask.class);
        verify(aiTaskRepository).save(saved.capture());
        AiTask task = saved.getValue();
        assertThat(task.getTaskType()).isEqualTo(AiTaskType.CHORD_GENERATION);
        assertThat(task.getStatus()).isEqualTo(AiTaskStatus.PENDING);
        assertThat(task.getMember()).isSameAs(me);
        assertThat(task.getScore()).isSameAs(score);
        JsonNode input = objectMapper.readTree(task.getInputData());
        assertThat(input.path("style").asText()).isEqualTo("JAZZ");
        assertThat(input.path("baseVersion").asInt()).isEqualTo(7);
        verify(entitlementService).checkAvailable("m-1", UsageMetric.CHORD_GENERATIONS, 1);
        verify(eventPublisher).publishEvent(new ChordTaskCreatedEvent("task-1", SCORE_ID));
    }
}
