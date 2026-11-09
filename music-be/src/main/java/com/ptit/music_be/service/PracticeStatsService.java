package com.ptit.music_be.service;

import java.time.LocalDate;
import java.util.List;

import com.ptit.music_be.dto.response.PracticeHeatmapDayResponse;
import com.ptit.music_be.dto.response.PracticeStreakResponse;

public interface PracticeStatsService {

    /** Các ngày có tập trong [from, to] (mặc định 365 ngày gần nhất), cũ nhất trước. */
    List<PracticeHeatmapDayResponse> getHeatmap(LocalDate from, LocalDate to);

    /** Chuỗi ngày luyện tập hiện tại và dài nhất. */
    PracticeStreakResponse getStreak();
}
