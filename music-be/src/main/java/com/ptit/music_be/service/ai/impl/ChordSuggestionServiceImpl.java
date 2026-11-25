package com.ptit.music_be.service.ai.impl;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ptit.music_be.dto.enums.ai.AiTaskStatus;
import com.ptit.music_be.dto.enums.ai.AiTaskType;
import com.ptit.music_be.dto.enums.ai.ChordCreativity;
import com.ptit.music_be.dto.enums.ai.ChordDensity;
import com.ptit.music_be.dto.enums.ai.ChordStyle;
import com.ptit.music_be.dto.enums.billing.PlanFeature;
import com.ptit.music_be.dto.enums.billing.RequestCap;
import com.ptit.music_be.dto.enums.billing.UsageMetric;
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
import com.ptit.music_be.service.score.ScoreEditService;
import com.ptit.music_be.service.permission.ScorePermissionService;
import com.ptit.music_be.utils.MusicXmlInspector;
import com.ptit.music_be.utils.SecurityUtils;

/** Tạo tác vụ gợi ý hợp âm (R3); việc chạy nằm ở {@code ChordGenerationWorker}. */
@Service
public class ChordSuggestionServiceImpl implements ChordSuggestionService {

    static final List<AiTaskStatus> ACTIVE = List.of(AiTaskStatus.PENDING, AiTaskStatus.PROCESSING);
    /** Gợi ý hợp âm chưa ai xử lý quá chừng này giờ thì tự đóng khi người dùng gợi ý lại. */
    static final int OPEN_SUGGESTION_TTL_HOURS = 24;

    static final String AUTO_CLOSE_NOTE = "Tự đóng vì đã cũ khi gợi ý hợp âm lại";

    private final ScoreRepository scoreRepository;
    private final ScoreSuggestionRepository suggestionRepository;
    private final AiTaskRepository aiTaskRepository;
    private final MemberRepository memberRepository;
    private final ScorePermissionService permissionService;
    private final EntitlementService entitlementService;
    private final AiTaskMapper aiTaskMapper;
    private final ApplicationEventPublisher eventPublisher;
    private final ObjectMapper objectMapper;
    private final ScoreEditService scoreEditService;

    public ChordSuggestionServiceImpl(
            ScoreRepository scoreRepository,
            ScoreSuggestionRepository suggestionRepository,
            AiTaskRepository aiTaskRepository,
            MemberRepository memberRepository,
            ScorePermissionService permissionService,
            EntitlementService entitlementService,
            AiTaskMapper aiTaskMapper,
            ApplicationEventPublisher eventPublisher,
            ObjectMapper objectMapper,
            ScoreEditService scoreEditService) {
        this.scoreRepository = scoreRepository;
        this.suggestionRepository = suggestionRepository;
        this.aiTaskRepository = aiTaskRepository;
        this.memberRepository = memberRepository;
        this.permissionService = permissionService;
        this.entitlementService = entitlementService;
        this.aiTaskMapper = aiTaskMapper;
        this.eventPublisher = eventPublisher;
        this.objectMapper = objectMapper;
        this.scoreEditService = scoreEditService;
    }

    @Override
    @Transactional
    public AiTaskResponse request(String scoreId, ChordSuggestionRequest request) {
        Score score = scoreRepository
                .findById(scoreId == null ? "" : scoreId)
                .orElseThrow(() -> new AppException(ScoreErrorCode.SCORE_NOT_EXISTED));
        // chỉ người sửa được bản nhạc mới được gợi ý hợp âm (người nhận xét thì không)
        if (!permissionService.canEdit(score, permissionService.resolve(score))) {
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
                    // Gợi ý cũ không còn dùng được (bản nhạc đã đổi phiên bản, hoặc bỏ đó quá lâu) thì tự đóng thay vì
                    // chặn người dùng bằng lỗi 3132 mà không mở lại được (CH-03)
                    if (isAbandoned(open, baseVersion)) {
                        open.setStatus(SuggestionStatus.OUTDATED);
                        open.setDecidedAt(LocalDateTime.now());
                        open.setDecisionNote(AUTO_CLOSE_NOTE);
                        suggestionRepository.save(open);
                        return;
                    }
                    throw new AppException(AiErrorCode.CHORD_SUGGESTION_PENDING, Map.of("suggestionId", open.getId()));
                });
        // Tùy chọn nâng cao và độ dài bài theo gói; kiểm trước số lượt để người dùng biết đúng lý do cần nâng cấp
        if (style.isAdvanced() || creativity == ChordCreativity.BOLD || density == ChordDensity.DENSE) {
            entitlementService.checkFeature(member.getId(), PlanFeature.CHORD_ADVANCED);
        }
        // Bản cũ có thể chưa ghi số ô: đếm từ MusicXML hiện hành để vẫn áp giới hạn của gói (CH-05)
        Integer measureCount = score.getMeasureCount() != null
                ? score.getMeasureCount()
                : countMeasures(score.getId(), baseVersion);
        if (measureCount != null) {
            if (score.getMeasureCount() == null) {
                score.setMeasureCount(measureCount);
            }
            entitlementService.checkRequestCap(member.getId(), RequestCap.CHORD_MEASURES, measureCount);
        }
        entitlementService.checkAvailable(member.getId(), UsageMetric.CHORD_GENERATIONS, 1);
        // Số phương án chốt theo gói lúc bấm, worker chỉ đọc lại
        int options = entitlementService.limitsOf(member.getId()).chordOptionsOrMax();

        ObjectNode input = objectMapper.createObjectNode();
        input.put("style", style.name());
        input.put("creativity", creativity.name());
        input.put("density", density.name());
        input.put("options", options);
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

    /** Số ô của part đầu trong phiên bản đã lưu (khớp {@code Score.measureCount}); null nếu không đọc được. */
    private Integer countMeasures(String scoreId, int version) {
        try {
            byte[] xml = scoreEditService.getVersionContent(scoreId, version).bytes();
            NodeList parts = MusicXmlInspector.parseStored(xml).getElementsByTagName("part");
            if (parts.getLength() == 0) {
                return null;
            }
            return ((Element) parts.item(0)).getElementsByTagName("measure").getLength();
        } catch (RuntimeException e) {
            return null; // hỏng thì để worker báo lỗi đọc bản nhạc như trước
        }
    }

    /** Gợi ý hợp âm đang mở mà không còn nạp làm bản nháp được: dựa trên phiên bản cũ, hoặc đã để quá lâu. */
    private static boolean isAbandoned(ScoreSuggestion open, int currentVersion) {
        if (open.getBaseVersion() != null && open.getBaseVersion() != currentVersion) {
            return true;
        }
        return open.getCreatedAt() != null
                && open.getCreatedAt().isBefore(LocalDateTime.now().minusHours(OPEN_SUGGESTION_TTL_HOURS));
    }
}
