package com.ptit.music_be.service.impl;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.ptit.music_be.dto.enums.PracticeSessionStatus;
import com.ptit.music_be.dto.enums.StudioHandMode;
import com.ptit.music_be.dto.enums.StudioInputSource;
import com.ptit.music_be.dto.enums.StudioMode;
import com.ptit.music_be.dto.enums.StudioNoteEventResult;
import com.ptit.music_be.dto.enums.practice.PracticeMode;
import com.ptit.music_be.dto.request.StudioSessionFinishRequest;
import com.ptit.music_be.dto.response.StudioMeasureBreakdown;
import com.ptit.music_be.dto.response.StudioSessionComparison;
import com.ptit.music_be.dto.response.StudioSessionCounts;
import com.ptit.music_be.dto.response.StudioSessionReportResponse;
import com.ptit.music_be.dto.response.StudioSessionSummaryResponse;
import com.ptit.music_be.dto.response.StudioTimelineResponse;
import com.ptit.music_be.dto.response.common.PageResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.PracticeSession;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.code.AccountErrorCode;
import com.ptit.music_be.exception.code.LibraryErrorCode;
import com.ptit.music_be.exception.code.ScoreErrorCode;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.practice.PracticeSessionRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.service.StudioReportService;
import com.ptit.music_be.service.StudioTimelineService;
import com.ptit.music_be.service.score.ScoreFileService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class StudioReportServiceImpl implements StudioReportService {

    static final int DEFAULT_PAGE_SIZE = 20;
    static final int MAX_PAGE_SIZE = 50;
    static final List<PracticeMode> STUDIO_MODES = List.of(PracticeMode.WAIT, PracticeMode.FREE_RUN);

    JdbcTemplate jdbcTemplate;
    MemberRepository memberRepository;
    PracticeSessionRepository practiceSessionRepository;
    ScoreRepository scoreRepository;
    ScoreFileService scoreFileService;
    StudioTimelineService studioTimelineService;

    @Override
    @Transactional
    public StudioSessionReportResponse finishSession(String sessionId, StudioSessionFinishRequest request) {
        validateFinishRequest(request);
        Member member = currentMember(true);
        PracticeSession session = practiceSessionRepository
                .findByIdAndMemberForUpdate(sessionId, member)
                .orElseThrow(() -> new AppException(LibraryErrorCode.STUDIO_SESSION_NOT_EXISTED));
        if (!STUDIO_MODES.contains(session.getMode())) {
            throw new AppException(LibraryErrorCode.STUDIO_SESSION_NOT_EXISTED);
        }
        if (session.getStatus() != PracticeSessionStatus.IN_PROGRESS) {
            throw new AppException(LibraryErrorCode.STUDIO_SESSION_NOT_ACTIVE);
        }

        EventCounts counts = withUnreachedNotes(
                session, eventCounts(sessionId, session.getMode(), request.coveredUntilMs()));
        int total = counts.expectedCount();
        session.setStatus(PracticeSessionStatus.COMPLETED);
        session.setEndedAt(LocalDateTime.now(ZoneOffset.UTC));
        session.setDurationSeconds(request.durationSeconds());
        session.setCoveredUntilMs(request.coveredUntilMs());
        session.setIsCompleted(request.reachedEnd());
        session.setTotalNotes(total);
        session.setPerfectCount(counts.perfect());
        session.setEarlyCount(counts.early());
        session.setLateCount(counts.late());
        session.setWrongPitchCount(counts.wrongPitch());
        session.setMissedCount(counts.missed());
        session.setAccuracyPct(accuracyPct(counts, total));
        session.setTimingAccuracyPct(timingAccuracyPct(counts, session.getMode(), total));
        session.setScorePoints((double) scorePoints(counts, session, total));

        PracticeSession saved = practiceSessionRepository.save(session);
        return buildReport(saved, counts);
    }

    @Override
    @Transactional(readOnly = true)
    public StudioSessionReportResponse getReport(String sessionId) {
        PracticeSession session = findOwnedSession(sessionId);
        if (session.getStatus() == PracticeSessionStatus.IN_PROGRESS) {
            throw new AppException(LibraryErrorCode.STUDIO_REPORT_NOT_READY);
        }
        return buildReport(session, countsOf(session));
    }

    @Override
    @Transactional(readOnly = true)
    public PageResponse<StudioSessionSummaryResponse> getSessions(String scoreId, StudioMode mode, int page, int size) {
        Member member = currentMember(false);
        int safeSize = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
        PageRequest pageable = PageRequest.of(
                Math.max(page, 0),
                safeSize,
                Sort.by(Sort.Direction.DESC, "startedAt").and(Sort.by("id")));
        List<PracticeMode> modes = mode == null ? STUDIO_MODES : List.of(toPracticeMode(mode));

        Page<PracticeSession> sessions;
        if (StringUtils.hasText(scoreId)) {
            Score score = findViewableScore(scoreId);
            sessions = practiceSessionRepository.findByMemberAndScoreAndModeInAndStatus(
                    member, score, modes, PracticeSessionStatus.COMPLETED, pageable);
        } else {
            sessions = practiceSessionRepository.findByMemberAndModeInAndStatus(
                    member, modes, PracticeSessionStatus.COMPLETED, pageable);
        }
        return PageResponse.<StudioSessionSummaryResponse>builder()
                .content(sessions.getContent().stream().map(this::toSummary).toList())
                .pageNumber(sessions.getNumber())
                .pageSize(sessions.getSize())
                .totalElements(sessions.getTotalElements())
                .totalPages(sessions.getTotalPages())
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<StudioSessionReportResponse> getBestSession(String scoreId) {
        Member member = currentMember(false);
        Score score = findViewableScore(scoreId);
        Page<PracticeSession> sessions = practiceSessionRepository.findByMemberAndScoreAndModeInAndStatus(
                member,
                score,
                STUDIO_MODES,
                PracticeSessionStatus.COMPLETED,
                PageRequest.of(0, 1, Sort.by(Sort.Direction.DESC, "scorePoints").and(Sort.by("startedAt"))));
        return sessions.stream()
                .findFirst()
                .map(session -> buildReport(session, countsOf(session)));
    }

    private StudioSessionReportResponse buildReport(PracticeSession session, EventCounts counts) {
        int total = counts.expectedCount();
        int points = scorePoints(counts, session, total);
        Double accuracy = accuracyPct(counts, total);
        Double timing = timingAccuracyPct(counts, session.getMode(), total);
        List<StudioMeasureBreakdown> measures =
                measureBreakdown(session.getId(), session.getMode(), session.getCoveredUntilMs());

        Double previousScore = practiceSessionRepository
                .findFirstByMemberAndScoreAndModeInAndStatusAndStartedAtLessThanOrderByStartedAtDesc(
                        session.getMember(),
                        session.getScore(),
                        STUDIO_MODES,
                        PracticeSessionStatus.COMPLETED,
                        session.getStartedAt())
                .map(PracticeSession::getScorePoints)
                .orElse(null);
        Double previousBest = practiceSessionRepository.findBestStudioScoreBefore(
                session.getMember(),
                session.getScore(),
                STUDIO_MODES,
                PracticeSessionStatus.COMPLETED,
                session.getStartedAt());
        Double bestScore = practiceSessionRepository.findBestStudioScore(
                session.getMember(), session.getScore(), STUDIO_MODES, PracticeSessionStatus.COMPLETED);
        // Kỷ lục chỉ xét phiên tập hết bài một lượt (không lặp đoạn): dừng giữa chừng không lập kỷ lục được (T40)
        boolean isNewBest = session.getStatus() == PracticeSessionStatus.COMPLETED
                && Boolean.TRUE.equals(session.getIsCompleted())
                && session.getLoopStartMeasure() == null
                && (previousBest == null || points > previousBest);

        return new StudioSessionReportResponse(
                session.getId(),
                session.getScore().getId(),
                session.getScore().getTitle(),
                toStudioMode(session.getMode()),
                orZero(session.getTempoPercent()).intValue(),
                session.getDurationSeconds(),
                Boolean.TRUE.equals(session.getIsCompleted()),
                points,
                grade(points),
                accuracy,
                timing,
                new StudioSessionCounts(
                        total, counts.perfect(), counts.early(), counts.late(), counts.wrongPitch(), counts.missed()),
                measures,
                weakestMeasures(measures),
                new StudioSessionComparison(toInteger(previousScore), toInteger(bestScore), isNewBest),
                session.getStartedAt());
    }

    private StudioSessionSummaryResponse toSummary(PracticeSession session) {
        int points = session.getScorePoints() == null ? 0 : (int) Math.round(session.getScorePoints());
        return new StudioSessionSummaryResponse(
                session.getId(),
                session.getScore().getId(),
                session.getScore().getTitle(),
                toStudioMode(session.getMode()),
                orZero(session.getTempoPercent()).intValue(),
                session.getDurationSeconds(),
                session.getStartedAt(),
                points,
                session.getAccuracyPct(),
                session.getTimingAccuracyPct(),
                grade(points));
    }

    /** Số liệu của phiên đã kết thúc (đã gồm nốt chưa tới tính Bỏ lỡ); phiên đang chạy thì đếm từ sự kiện. */
    private EventCounts countsOf(PracticeSession session) {
        if (session.getStatus() != PracticeSessionStatus.IN_PROGRESS && session.getPerfectCount() != null) {
            return new EventCounts(
                    session.getPerfectCount(),
                    orZero(session.getEarlyCount()),
                    orZero(session.getLateCount()),
                    orZero(session.getWrongPitchCount()),
                    orZero(session.getMissedCount()));
        }
        return eventCounts(session.getId(), session.getMode(), session.getCoveredUntilMs());
    }

    /**
     * Phiên tập cả bài một lượt (không lặp đoạn): số nốt chuẩn lấy từ timeline của máy chủ theo tay đã chọn, nốt chưa
     * chơi tới (dừng sớm) tính Bỏ lỡ, nên không thể dừng sau vài nốt đúng để được 100% (T40, ST-09).
     */
    EventCounts withUnreachedNotes(PracticeSession session, EventCounts counts) {
        if (session.getLoopStartMeasure() != null) {
            return counts;
        }
        int expected = expectedNoteCount(studioTimelineService.getTimeline(session.getScore().getId()), session);
        int unreached = expected - counts.expectedCount();
        return unreached > 0 ? counts.withMissed(counts.missed() + unreached) : counts;
    }

    static int expectedNoteCount(StudioTimelineResponse timeline, PracticeSession session) {
        StudioHandMode hands = session.getHandMode() == null ? StudioHandMode.BOTH : session.getHandMode();
        return (int) timeline.notes().stream()
                .filter(StudioTimelineResponse.Note::scorable)
                .filter(note -> hands == StudioHandMode.BOTH
                        || note.hand() == null
                        || note.hand().equals(hands == StudioHandMode.RIGHT_ONLY ? "RIGHT" : "LEFT"))
                .count();
    }

    private EventCounts eventCounts(String sessionId, PracticeMode mode, Integer coveredUntilMs) {
        Map<StudioNoteEventResult, Integer> counts = new HashMap<>();
        if (mode == PracticeMode.FREE_RUN && coveredUntilMs != null) {
            jdbcTemplate.query(
                    """
					SELECT result, COUNT(*)
					FROM practice_note_event
					WHERE session_id = ?
						AND ((played_ms IS NOT NULL AND played_ms <= ?)
							OR (played_ms IS NULL AND expected_ms <= ?))
					GROUP BY result
					""",
                    (RowCallbackHandler) resultSet ->
                            counts.put(StudioNoteEventResult.valueOf(resultSet.getString(1)), resultSet.getInt(2)),
                    sessionId,
                    coveredUntilMs,
                    coveredUntilMs);
        } else {
            jdbcTemplate.query(
                    "SELECT result, COUNT(*) FROM practice_note_event WHERE session_id = ? GROUP BY result",
                    (RowCallbackHandler) resultSet ->
                            counts.put(StudioNoteEventResult.valueOf(resultSet.getString(1)), resultSet.getInt(2)),
                    sessionId);
        }
        return new EventCounts(
                counts.getOrDefault(StudioNoteEventResult.PERFECT, 0),
                counts.getOrDefault(StudioNoteEventResult.EARLY, 0),
                counts.getOrDefault(StudioNoteEventResult.LATE, 0),
                counts.getOrDefault(StudioNoteEventResult.WRONG_PITCH, 0),
                counts.getOrDefault(StudioNoteEventResult.MISSED, 0));
    }

    private List<StudioMeasureBreakdown> measureBreakdown(String sessionId, PracticeMode mode, Integer coveredUntilMs) {
        Map<Integer, int[]> countsByMeasure = new TreeMap<>();
        String query = """
				SELECT measure, result, COUNT(*)
				FROM practice_note_event
				WHERE session_id = ? AND measure IS NOT NULL
				""";
        List<Object> arguments = new ArrayList<>(List.of(sessionId));
        if (mode == PracticeMode.FREE_RUN && coveredUntilMs != null) {
            query += """
					AND ((played_ms IS NOT NULL AND played_ms <= ?)
						OR (played_ms IS NULL AND expected_ms <= ?))
					""";
            arguments.add(coveredUntilMs);
            arguments.add(coveredUntilMs);
        }
        query += """
				GROUP BY measure, result
				ORDER BY measure
				""";
        jdbcTemplate.query(
                query,
                (RowCallbackHandler) resultSet -> {
                    int measure = resultSet.getInt(1);
                    int[] counts = countsByMeasure.computeIfAbsent(measure, ignored -> new int[5]);
                    counts[resultIndex(StudioNoteEventResult.valueOf(resultSet.getString(2)))] = resultSet.getInt(3);
                },
                arguments.toArray());
        List<StudioMeasureBreakdown> result = new ArrayList<>();
        countsByMeasure.forEach((measure, counts) ->
                result.add(new StudioMeasureBreakdown(measure, counts[0], counts[1], counts[2], counts[3], counts[4])));
        return result;
    }

    private static List<Integer> weakestMeasures(List<StudioMeasureBreakdown> measures) {
        return measures.stream()
                .filter(measure -> measure.early() + measure.late() + measure.wrongPitch() + measure.missed() > 0)
                .sorted((left, right) -> {
                    int leftErrors = left.early() + left.late() + left.wrongPitch() + left.missed();
                    int rightErrors = right.early() + right.late() + right.wrongPitch() + right.missed();
                    int byErrors = Integer.compare(rightErrors, leftErrors);
                    return byErrors != 0 ? byErrors : Integer.compare(left.measure(), right.measure());
                })
                .limit(3)
                .map(StudioMeasureBreakdown::measure)
                .toList();
    }

    private static int resultIndex(StudioNoteEventResult result) {
        return switch (result) {
            case PERFECT -> 0;
            case EARLY -> 1;
            case LATE -> 2;
            case WRONG_PITCH -> 3;
            case MISSED -> 4;
        };
    }

    private static Double accuracyPct(EventCounts counts, int total) {
        return total == 0 ? null : percent(counts.perfect() + counts.early() + counts.late(), total);
    }

    private static Double timingAccuracyPct(EventCounts counts, PracticeMode mode, int total) {
        if (mode == PracticeMode.WAIT) {
            return null;
        }
        int timedNotes = counts.perfect() + counts.early() + counts.late();
        return timedNotes == 0 || total == 0 ? 0.0 : percent(counts.perfect(), timedNotes);
    }

    private static int scorePoints(EventCounts counts, PracticeSession session, int total) {
        return scorePoints(counts, session.getMode(), session.getInputSource() == StudioInputSource.MIC, total);
    }

    /**
     * Điểm 0–10000. Micro hay nghe ra nốt thừa (hoạ âm, tiếng vang) nên với micro nốt sai vẫn được đếm nhưng không trừ
     * điểm (ST-12).
     */
    static int scorePoints(EventCounts counts, PracticeMode mode, boolean microphone, int total) {
        if (total == 0) {
            return 0;
        }
        double wrongPenalty = microphone ? 0 : 0.3 * counts.wrongPitch();
        // Chờ nốt không chấm nhịp: đúng cao độ là đủ, nốt sai trừ 0,3 (thang riêng, Q5); tối đa 10000 như Chạy tự do (ST-10)
        double normalized = mode == PracticeMode.WAIT
                ? (counts.perfect() + counts.early() + counts.late() - wrongPenalty) / total
                : (counts.perfect() + 0.7 * (counts.early() + counts.late()) - wrongPenalty) / total;
        return (int) Math.round(Math.max(0, Math.min(1, normalized)) * 10000);
    }

    private static double percent(int numerator, int denominator) {
        return Math.round(numerator * 10000.0 / denominator) / 100.0;
    }

    private static String grade(int points) {
        if (points >= 9500) return "S";
        if (points >= 8500) return "A";
        if (points >= 7000) return "B";
        if (points >= 5000) return "C";
        return "D";
    }

    private PracticeSession findOwnedSession(String id) {
        Member member = currentMember(false);
        return practiceSessionRepository
                .findByIdAndMember(id, member)
                .filter(session -> STUDIO_MODES.contains(session.getMode()))
                .orElseThrow(() -> new AppException(LibraryErrorCode.STUDIO_SESSION_NOT_EXISTED));
    }

    private Score findViewableScore(String scoreId) {
        return scoreRepository
                .findById(scoreId)
                .filter(scoreFileService::canView)
                .orElseThrow(() -> new AppException(ScoreErrorCode.SCORE_NOT_EXISTED));
    }

    private Member currentMember(boolean forUpdate) {
        return (forUpdate
                        ? memberRepository.findByEmailForUpdate(SecurityUtils.getCurrentEmail())
                        : memberRepository.findByEmail(SecurityUtils.getCurrentEmail()))
                .orElseThrow(() -> new AppException(AccountErrorCode.USER_NOT_EXISTED));
    }

    private static void validateFinishRequest(StudioSessionFinishRequest request) {
        if (request == null
                || request.durationSeconds() == null
                || request.durationSeconds() < 0
                || request.durationSeconds() > 86400
                || request.reachedEnd() == null
                || request.coveredUntilMs() == null
                || request.coveredUntilMs() < 0) {
            throw new AppException(AccountErrorCode.INVALID_REQUEST);
        }
    }

    private static StudioMode toStudioMode(PracticeMode mode) {
        return switch (mode) {
            case WAIT -> StudioMode.WAIT;
            case FREE_RUN -> StudioMode.FREE_RUN;
            default -> throw new IllegalStateException("Session does not belong to Studio");
        };
    }

    private static PracticeMode toPracticeMode(StudioMode mode) {
        return switch (mode) {
            case WAIT -> PracticeMode.WAIT;
            case FREE_RUN -> PracticeMode.FREE_RUN;
        };
    }

    private static Integer toInteger(Double value) {
        return value == null ? null : (int) Math.round(value);
    }

    private static Double orZero(Double value) {
        return value == null ? 0.0 : value;
    }

    record EventCounts(int perfect, int early, int late, int wrongPitch, int missed) {
        int expectedCount() {
            return perfect + early + late + missed;
        }

        EventCounts withMissed(int newMissed) {
            return new EventCounts(perfect, early, late, wrongPitch, newMissed);
        }
    }

    private static int orZero(Integer value) {
        return value == null ? 0 : value;
    }
}
