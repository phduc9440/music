package com.ptit.music_be.service.ai.impl;

import java.util.List;
import java.util.Map;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ptit.music_be.dto.enums.ai.AiTaskStatus;
import com.ptit.music_be.dto.enums.ai.AiTaskType;
import com.ptit.music_be.dto.enums.ai.ChordCreativity;
import com.ptit.music_be.dto.enums.ai.ChordDensity;
import com.ptit.music_be.dto.enums.ai.ChordStyle;
import com.ptit.music_be.dto.enums.billing.UsageMetric;
import com.ptit.music_be.dto.enums.score.ScoreAccess;
import com.ptit.music_be.dto.enums.score.SuggestionSource;
import com.ptit.music_be.dto.enums.score.SuggestionStatus;
import com.ptit.music_be.dto.request.ai.ChordSuggestionRequest;
import com.ptit.music_be.dto.response.ai.AiTaskResponse;
import com.ptit.music_be.entity.AiTask;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.event.ChordTaskCreatedEvent;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.code.AccountErrorCode;
import com.ptit.music_be.exception.code.AiErrorCode;
import com.ptit.music_be.exception.code.ScoreErrorCode;
import com.ptit.music_be.mapper.AiTaskMapper;
import com.ptit.music_be.repository.ai.AiTaskRepository;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.repository.score.ScoreSuggestionRepository;
import com.ptit.music_be.service.ai.ChordSuggestionService;
import com.ptit.music_be.service.billing.EntitlementService;
import com.ptit.music_be.service.permission.ScorePermissionService;
import com.ptit.music_be.utils.SecurityUtils;

/** Tạo tác vụ gợi ý hợp âm (R3); việc chạy nằm ở {@code ChordGenerationWorker}. */
@Service
public class ChordSuggestionServiceImpl implements ChordSuggestionService {

    static final List<AiTaskStatus> ACTIVE = List.of(AiTaskStatus.PENDING, AiTaskStatus.PROCESSING);

    private final ScoreRepository scoreRepository;
    private final ScoreSuggestionRepository suggestionRepository;
    private final AiTaskRepository aiTaskRepository;
    private final MemberRepository memberRepository;
    private final ScorePermissionService permissionService;
    private final EntitlementService entitlementService;
    private final AiTaskMapper aiTaskMapper;
    private final ApplicationEventPublisher eventPublisher;
    private final ObjectMapper objectMapper;

    public ChordSuggestionServiceImpl(
            ScoreRepository scoreRepository,
            ScoreSuggestionRepository suggestionRepository,
            AiTaskRepository aiTaskRepository,
            MemberRepository memberRepository,
            ScorePermissionService permissionService,
            EntitlementService entitlementService,
            AiTaskMapper aiTaskMapper,
            ApplicationEventPublisher eventPublisher,
            ObjectMapper objectMapper) {
        this.scoreRepository = scoreRepository;
        this.suggestionRepository = suggestionRepository;
        this.aiTaskRepository = aiTaskRepository;
        this.memberRepository = memberRepository;
        this.permissionService = permissionService;
        this.entitlementService = entitlementService;
        this.aiTaskMapper = aiTaskMapper;
        this.eventPublisher = eventPublisher;
        this.objectMapper = objectMapper;
    }

    @Override
    @Transactional
    public AiTaskResponse request(String scoreId, ChordSuggestionRequest request) {
        Score score = scoreRepository
                .findById(scoreId == null ? "" : scoreId)
                .orElseThrow(() -> new AppException(ScoreErrorCode.SCORE_NOT_EXISTED));
        if (!permissionService.resolve(score).can(ScoreAccess.REVIEW)) {
            throw new AppException(AccountErrorCode.UNAUTHORIZED);
        }
        ChordStyle style = ChordStyle.parse(request == null ? null : request.getStyle())
                .orElseThrow(() -> new AppException(AiErrorCode.CHORD_STYLE_INVALID));
        ChordCreativity creativity = ChordCreativity.parse(request == null ? null : request.getCreativity())
                .orElseThrow(() -> new AppException(AiErrorCode.CHORD_STYLE_INVALID));
        ChordDensity density = ChordDensity.parse(request == null ? null : request.getDensity())
                .orElseThrow(() -> new AppException(AiErrorCode.CHORD_STYLE_INVALID));
        Integer baseVersion = score.getCurrentVersion();
        if (baseVersion == null || baseVersion < 1) {
            throw new AppException(ScoreErrorCode.MUSICXML_NOT_READY);
        }
        if (aiTaskRepository.existsByScoreIdAndTaskTypeAndStatusIn(score.getId(), AiTaskType.OMR_CONVERSION, ACTIVE)) {
            throw new AppException(ScoreErrorCode.SCORE_BUSY);
        }

        // Khóa dòng người bấm để hai yêu cầu cùng lúc không cùng vượt hạn mức
        Member member = memberRepository
                .findByEmailForUpdate(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(AccountErrorCode.USER_NOT_EXISTED));
        if (aiTaskRepository.existsByScoreIdAndTaskTypeAndStatusIn(
                score.getId(), AiTaskType.CHORD_GENERATION, ACTIVE)) {
            throw new AppException(AiErrorCode.CHORD_TASK_RUNNING);
        }
        suggestionRepository
                .findFirstByScoreIdAndSourceAndStatus(
                        score.getId(), SuggestionSource.CHORD_GENERATION, SuggestionStatus.OPEN)
                .ifPresent(open -> {
                    throw new AppException(AiErrorCode.CHORD_SUGGESTION_PENDING, Map.of("suggestionId", open.getId()));
                });
        entitlementService.checkAvailable(member.getId(), UsageMetric.CHORD_GENERATIONS, 1);

        ObjectNode input = objectMapper.createObjectNode();
        input.put("style", style.name());
        input.put("creativity", creativity.name());
        input.put("density", density.name());
        input.put("baseVersion", baseVersion);
        input.put("replaceExisting", request != null && Boolean.TRUE.equals(request.getReplaceExisting()));
        AiTask task = aiTaskRepository.save(AiTask.builder()
                .member(member)
                .score(score)
                .taskType(AiTaskType.CHORD_GENERATION)
                .status(AiTaskStatus.PENDING)
                .progress(0)
                .inputData(input.toString())
                .build());
        eventPublisher.publishEvent(new ChordTaskCreatedEvent(task.getId(), score.getId()));
        return aiTaskMapper.toResponse(task);
    }
}
