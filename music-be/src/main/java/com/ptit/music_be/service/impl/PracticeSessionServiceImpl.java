package com.ptit.music_be.service.impl;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.request.PracticeSessionRequest;
import com.ptit.music_be.dto.response.PageResponse;
import com.ptit.music_be.dto.response.PracticeSessionResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.PracticeSession;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.PracticeSessionRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.PracticeSessionService;
import com.ptit.music_be.service.ScoreFileService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class PracticeSessionServiceImpl implements PracticeSessionService {

    static int DEFAULT_PAGE_SIZE = 20;
    static int MAX_PAGE_SIZE = 50;
    static int MAX_ERROR_LOG_ENTRIES = 5000;
    static int MAX_DURATION_SECONDS = 24 * 3600;

    PracticeSessionRepository practiceSessionRepository;
    MemberRepository memberRepository;
    ScoreRepository scoreRepository;
    ScoreFileService scoreFileService;
    ObjectMapper objectMapper;

    @Override
    @Transactional
    public PracticeSessionResponse create(PracticeSessionRequest request) {
        if (request == null || request.getMode() == null || !StringUtils.hasText(request.getScoreId())) {
            throw new AppException(ErrorCode.PRACTICE_SESSION_INVALID);
        }
        Member me = currentMember();
        Score score = scoreRepository
                .findById(request.getScoreId())
                .orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
        // Bản nhạc không xem được thì trả "không tồn tại" để không lộ id
        if (!scoreFileService.canView(score)) {
            throw new AppException(ErrorCode.SCORE_NOT_EXISTED);
        }
        validate(request);

        int total = orZero(request.getTotalNotes());
        int perfect = orZero(request.getPerfectCount());
        int early = orZero(request.getEarlyCount());
        int late = orZero(request.getLateCount());
        // % đúng = nốt chơi đúng cao độ (đúng giờ, sớm hoặc trễ) / tổng nốt; % đúng nhịp = nốt đúng giờ / tổng nốt
        Double accuracy = request.getAccuracyPct() != null
                ? request.getAccuracyPct()
                : (total > 0 ? percent(perfect + early + late, total) : null);
        Double timing = request.getTimingAccuracyPct() != null
                ? request.getTimingAccuracyPct()
                : (total > 0 ? percent(perfect, total) : null);

        LocalDateTime ended = request.getEndedAt() != null ? request.getEndedAt() : LocalDateTime.now();
        PracticeSession session = PracticeSession.builder()
                .member(me)
                .score(score)
                .mode(request.getMode())
                .tempoPercent(request.getTempoPercent())
                .loopStartMeasure(request.getLoopStartMeasure())
                .loopEndMeasure(request.getLoopEndMeasure())
                .startedAt(request.getStartedAt() != null ? request.getStartedAt() : ended)
                .endedAt(ended)
                .durationSeconds(request.getDurationSeconds())
                .totalNotes(request.getTotalNotes())
                .perfectCount(request.getPerfectCount())
                .earlyCount(request.getEarlyCount())
                .lateCount(request.getLateCount())
                .wrongPitchCount(request.getWrongPitchCount())
                .missedCount(request.getMissedCount())
                .accuracyPct(accuracy)
                .timingAccuracyPct(timing)
                .scorePoints(request.getScorePoints())
                .isCompleted(request.getIsCompleted() != null ? request.getIsCompleted() : Boolean.FALSE)
                .errorLog(serializeErrorLog(request.getErrorLog()))
                .build();
        return toResponse(practiceSessionRepository.save(session), true);
    }

    @Override
    @Transactional(readOnly = true)
    public PageResponse<PracticeSessionResponse> getMySessions(String scoreId, int page, int size) {
        Member me = currentMember();
        int safeSize = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
        PageRequest pageable = PageRequest.of(
                Math.max(page, 0), safeSize, Sort.by(Sort.Direction.DESC, "startedAt").and(Sort.by("id")));
        Page<PracticeSession> result;
        if (StringUtils.hasText(scoreId)) {
            Score score = scoreRepository
                    .findById(scoreId)
                    .orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
            result = practiceSessionRepository.findByMemberAndScore(me, score, pageable);
        } else {
            result = practiceSessionRepository.findByMember(me, pageable);
        }
        List<PracticeSessionResponse> content =
                result.getContent().stream().map(s -> toResponse(s, false)).toList();
        return PageResponse.<PracticeSessionResponse>builder()
                .content(content)
                .pageNumber(result.getNumber())
                .pageSize(result.getSize())
                .totalElements(result.getTotalElements())
                .totalPages(result.getTotalPages())
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public PracticeSessionResponse getSession(String id) {
        return toResponse(findOwned(id), true);
    }

    @Override
    @Transactional
    public void delete(String id) {
        practiceSessionRepository.delete(findOwned(id));
    }

    // ------------------------------------------------------------------ helpers

    private void validate(PracticeSessionRequest r) {
        Integer[] counts = {
            r.getTotalNotes(),
            r.getPerfectCount(),
            r.getEarlyCount(),
            r.getLateCount(),
            r.getWrongPitchCount(),
            r.getMissedCount(),
            r.getDurationSeconds(),
            r.getLoopStartMeasure(),
            r.getLoopEndMeasure()
        };
        for (Integer c : counts) {
            if (c != null && c < 0) {
                throw new AppException(ErrorCode.PRACTICE_SESSION_INVALID);
            }
        }
        if (r.getDurationSeconds() != null && r.getDurationSeconds() > MAX_DURATION_SECONDS) {
            throw new AppException(ErrorCode.PRACTICE_SESSION_INVALID);
        }
        // Tổng các loại nốt không được vượt tổng số nốt
        long sum = (long) orZero(r.getPerfectCount())
                + orZero(r.getEarlyCount())
                + orZero(r.getLateCount())
                + orZero(r.getWrongPitchCount())
                + orZero(r.getMissedCount());
        if (r.getTotalNotes() != null && sum > r.getTotalNotes()) {
            throw new AppException(ErrorCode.PRACTICE_SESSION_INVALID);
        }
        if (r.getTempoPercent() != null && (r.getTempoPercent() <= 0 || r.getTempoPercent() > 400)) {
            throw new AppException(ErrorCode.PRACTICE_SESSION_INVALID);
        }
        if (isBadPercent(r.getAccuracyPct()) || isBadPercent(r.getTimingAccuracyPct())) {
            throw new AppException(ErrorCode.PRACTICE_SESSION_INVALID);
        }
        if (r.getLoopStartMeasure() != null
                && r.getLoopEndMeasure() != null
                && r.getLoopStartMeasure() > r.getLoopEndMeasure()) {
            throw new AppException(ErrorCode.PRACTICE_SESSION_INVALID);
        }
        if (r.getStartedAt() != null && r.getEndedAt() != null && r.getEndedAt().isBefore(r.getStartedAt())) {
            throw new AppException(ErrorCode.PRACTICE_SESSION_INVALID);
        }
        if (r.getScorePoints() != null && r.getScorePoints() < 0) {
            throw new AppException(ErrorCode.PRACTICE_SESSION_INVALID);
        }
    }

    private static boolean isBadPercent(Double v) {
        return v != null && (v.isNaN() || v < 0 || v > 100);
    }

    private String serializeErrorLog(JsonNode errorLog) {
        if (errorLog == null || errorLog.isNull()) {
            return null;
        }
        if (!errorLog.isArray() || errorLog.size() > MAX_ERROR_LOG_ENTRIES) {
            throw new AppException(ErrorCode.PRACTICE_SESSION_INVALID);
        }
        try {
            return objectMapper.writeValueAsString(errorLog);
        } catch (JsonProcessingException e) {
            throw new AppException(ErrorCode.PRACTICE_SESSION_INVALID);
        }
    }

    private JsonNode parseErrorLog(String json) {
        if (!StringUtils.hasText(json)) {
            return null;
        }
        try {
            return objectMapper.readTree(json);
        } catch (JsonProcessingException e) {
            return null;
        }
    }

    private static int orZero(Integer v) {
        return v == null ? 0 : v;
    }

    private static double percent(int part, int whole) {
        return Math.round(part * 10000.0 / whole) / 100.0;
    }

    /** Phiên của người khác cũng trả "không tồn tại" để không lộ id. */
    private PracticeSession findOwned(String id) {
        Member me = currentMember();
        return practiceSessionRepository
                .findById(id)
                .filter(s -> s.getMember().getId().equals(me.getId()))
                .orElseThrow(() -> new AppException(ErrorCode.PRACTICE_SESSION_NOT_EXISTED));
    }

    private Member currentMember() {
        return memberRepository
                .findByEmail(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
    }

    private PracticeSessionResponse toResponse(PracticeSession s, boolean withErrorLog) {
        return PracticeSessionResponse.builder()
                .id(s.getId())
                .scoreId(s.getScore().getId())
                .scoreTitle(s.getScore().getTitle())
                .mode(s.getMode())
                .tempoPercent(s.getTempoPercent())
                .loopStartMeasure(s.getLoopStartMeasure())
                .loopEndMeasure(s.getLoopEndMeasure())
                .startedAt(s.getStartedAt())
                .endedAt(s.getEndedAt())
                .durationSeconds(s.getDurationSeconds())
                .totalNotes(s.getTotalNotes())
                .perfectCount(s.getPerfectCount())
                .earlyCount(s.getEarlyCount())
                .lateCount(s.getLateCount())
                .wrongPitchCount(s.getWrongPitchCount())
                .missedCount(s.getMissedCount())
                .accuracyPct(s.getAccuracyPct())
                .timingAccuracyPct(s.getTimingAccuracyPct())
                .scorePoints(s.getScorePoints())
                .isCompleted(s.getIsCompleted())
                .errorLog(withErrorLog ? parseErrorLog(s.getErrorLog()) : null)
                .build();
    }
}
