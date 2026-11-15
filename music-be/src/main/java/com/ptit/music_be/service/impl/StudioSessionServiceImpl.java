package com.ptit.music_be.service.impl;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.practice.PracticeMode;
import com.ptit.music_be.dto.enums.PracticeSessionStatus;
import com.ptit.music_be.dto.enums.StudioMode;
import com.ptit.music_be.dto.request.StudioSessionCreateRequest;
import com.ptit.music_be.dto.response.StudioSessionResponse;
import com.ptit.music_be.dto.response.StudioTimelineResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.PracticeSession;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.practice.PracticeSessionRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.service.score.ScoreFileService;
import com.ptit.music_be.service.StudioSessionService;
import com.ptit.music_be.service.StudioTimelineService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class StudioSessionServiceImpl implements StudioSessionService {

    MemberRepository memberRepository;
    PracticeSessionRepository practiceSessionRepository;
    ScoreRepository scoreRepository;
    ScoreFileService scoreFileService;
    StudioTimelineService studioTimelineService;

    @Override
    @Transactional
    public StudioSessionResponse createSession(StudioSessionCreateRequest request) {
        Score score = scoreRepository
                .findById(request.scoreId())
                .filter(scoreFileService::canView)
                .orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
        StudioTimelineResponse timeline = studioTimelineService.getTimeline(score.getId());
        validateLoop(request, timeline.measureCount());
        int firstMeasure = request.loopStartMeasure() == null ? 1 : request.loopStartMeasure();
        int lastMeasure = request.loopEndMeasure() == null ? timeline.measureCount() : request.loopEndMeasure();
        int scorableNotes = (int) timeline.notes().stream()
                .filter(StudioTimelineResponse.Note::scorable)
                .filter(note -> note.measure() >= firstMeasure && note.measure() <= lastMeasure)
                .count();

        Member member = memberRepository
                .findByEmailForUpdate(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
        practiceSessionRepository
                .findByMemberAndStatus(member, PracticeSessionStatus.IN_PROGRESS)
                .ifPresent(session -> {
                    throw new AppException(
                            ErrorCode.STUDIO_SESSION_ALREADY_ACTIVE,
                            java.util.Map.of("activeSessionId", session.getId()));
                });

        Instant now = Instant.now();
        PracticeSession session = PracticeSession.builder()
                .member(member)
                .score(score)
                .mode(toStoredMode(request.mode()))
                .status(PracticeSessionStatus.IN_PROGRESS)
                .inputSource(request.inputSource())
                .handMode(request.handMode())
                .tempoPercent(request.tempoPercent().doubleValue())
                .loopStartMeasure(request.loopStartMeasure())
                .loopEndMeasure(request.loopEndMeasure())
                .startedAt(LocalDateTime.ofInstant(now, ZoneOffset.UTC))
                .isCompleted(false)
                .totalNotes(scorableNotes)
                .perfectCount(0)
                .earlyCount(0)
                .lateCount(0)
                .wrongPitchCount(0)
                .missedCount(0)
                .build();
        PracticeSession saved = practiceSessionRepository.save(session);
        return toResponse(saved, scorableNotes, now);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<StudioSessionResponse> getActiveSession() {
        Member member = memberRepository
                .findByEmail(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
        return practiceSessionRepository
                .findByMemberAndStatus(member, PracticeSessionStatus.IN_PROGRESS)
                .map(session -> {
                    return toResponse(session, session.getTotalNotes(), Instant.now());
                });
    }

    @Override
    @Transactional
    public void abortSession(String sessionId) {
        Member member = memberRepository
                .findByEmailForUpdate(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
        PracticeSession session = practiceSessionRepository
                .findByIdAndMemberForUpdate(sessionId, member)
                .orElseThrow(() -> new AppException(ErrorCode.STUDIO_SESSION_NOT_EXISTED));
        if (session.getStatus() != PracticeSessionStatus.IN_PROGRESS) {
            throw new AppException(ErrorCode.STUDIO_SESSION_NOT_ACTIVE);
        }
        session.setStatus(PracticeSessionStatus.ABANDONED);
        session.setEndedAt(LocalDateTime.now(ZoneOffset.UTC));
        session.setIsCompleted(false);
        practiceSessionRepository.save(session);
    }

    private static void validateLoop(StudioSessionCreateRequest request, int measureCount) {
        Integer start = request.loopStartMeasure();
        Integer end = request.loopEndMeasure();
        if ((start == null) != (end == null) || (start != null && (start > end || end > measureCount))) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
    }

    private static PracticeMode toStoredMode(StudioMode mode) {
        return switch (mode) {
            case WAIT -> PracticeMode.WAIT;
            case FREE_RUN -> PracticeMode.FREE_RUN;
        };
    }

    private static StudioMode toStudioMode(PracticeMode mode) {
        return switch (mode) {
            case WAIT -> StudioMode.WAIT;
            case FREE_RUN -> StudioMode.FREE_RUN;
            default -> throw new IllegalStateException("Active Studio session has a legacy practice mode");
        };
    }

    private static StudioSessionResponse toResponse(PracticeSession session, int scorableNotes, Instant serverTime) {
        Instant startedAt = session.getStartedAt().toInstant(ZoneOffset.UTC);
        return new StudioSessionResponse(
                session.getId(),
                session.getScore().getId(),
                toStudioMode(session.getMode()),
                session.getInputSource(),
                session.getHandMode(),
                session.getStatus(),
                session.getTempoPercent().intValue(),
                session.getLoopStartMeasure(),
                session.getLoopEndMeasure(),
                startedAt,
                serverTime,
                scorableNotes);
    }
}
