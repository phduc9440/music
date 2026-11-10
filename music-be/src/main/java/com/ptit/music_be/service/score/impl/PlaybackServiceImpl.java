package com.ptit.music_be.service.score.impl;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.response.ViewCountResponse;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.ScoreCounterRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.score.PlaybackService;
import com.ptit.music_be.service.score.ScoreFileService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class PlaybackServiceImpl implements PlaybackService {

    static final String VISIBILITY_PUBLIC = "PUBLIC";

    /** Một người chỉ được tính một lượt xem cho mỗi bản nhạc trong khoảng này. */
    static final Duration VIEW_WINDOW = Duration.ofMinutes(30);

    /** Quá ngưỡng này thì dọn các mục đã hết hạn để bộ nhớ không phình ra. */
    static final int PURGE_THRESHOLD = 5_000;

    ScoreRepository scoreRepository;
    ScoreCounterRepository scoreCounterRepository;
    ScoreFileService scoreFileService;

    /** Khóa "email|scoreId" -> thời điểm được tính lượt xem gần nhất (chỉ trong bộ nhớ, mất khi khởi động lại). */
    ConcurrentHashMap<String, Instant> recentViews = new ConcurrentHashMap<>();

    @Override
    @Transactional
    public ViewCountResponse recordView(String scoreId) {
        Score score =
                scoreRepository.findById(scoreId).orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
        scoreFileService.checkCanView(score);

        String email = SecurityUtils.getCurrentEmail();
        boolean isOwner =
                score.getMember() != null && email.equals(score.getMember().getEmail());
        if (!VISIBILITY_PUBLIC.equals(score.getVisibility()) || isOwner || !claimView(email, scoreId)) {
            return new ViewCountResponse(currentCount(scoreId), false);
        }

        scoreCounterRepository.incrementViewCount(scoreId);
        scoreCounterRepository.incrementDailyViews(scoreId, java.time.LocalDate.now());
        return new ViewCountResponse(currentCount(scoreId), true);
    }

    /** Đánh dấu người này vừa xem bản nhạc; false nếu họ đã được tính trong {@link #VIEW_WINDOW}. */
    private boolean claimView(String email, String scoreId) {
        Instant now = Instant.now();
        if (recentViews.size() > PURGE_THRESHOLD) {
            recentViews.values().removeIf(at -> at.plus(VIEW_WINDOW).isBefore(now));
        }
        boolean[] counted = {false};
        recentViews.compute(email + "|" + scoreId, (key, last) -> {
            if (last == null || last.plus(VIEW_WINDOW).isBefore(now)) {
                counted[0] = true;
                return now;
            }
            return last;
        });
        return counted[0];
    }

    private long currentCount(String scoreId) {
        Long count = scoreCounterRepository.findViewCount(scoreId);
        return count == null ? 0L : count;
    }
}
