package com.ptit.music_be.service;

import java.time.LocalDate;
import java.util.List;

import com.ptit.music_be.dto.response.PracticeHeatmapDayResponse;
import com.ptit.music_be.dto.response.PracticeStreakResponse;
import com.ptit.music_be.dto.response.PracticeTimeBucketResponse;

public interface PracticeStatsService {

    /** Các ngày có tập trong [from, to] (mặc định 365 ngày gần nhất), cũ nhất trước. */
    List<PracticeHeatmapDayResponse> getHeatmap(LocalDate from, LocalDate to);

    /**
     * Thời gian luyện tập theo chu kỳ DAY / WEEK / MONTH, kết thúc ở chu kỳ chứa hôm nay, cũ nhất trước. Chu kỳ không
     * có phiên tập vẫn có mặt (0 giây). count để trống thì lấy mặc định (30 ngày / 12 tuần / 12 tháng).
     */
    List<PracticeTimeBucketResponse> getTimeStats(String period, Integer count);

    /** Chuỗi ngày luyện tập hiện tại và dài nhất. */
    PracticeStreakResponse getStreak();
}
