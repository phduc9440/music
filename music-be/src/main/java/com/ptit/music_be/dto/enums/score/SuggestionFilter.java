package com.ptit.music_be.dto.enums.score;

import java.util.Arrays;
import java.util.List;

/** Bộ lọc danh sách đề xuất: đang mở, đã đóng hoặc tất cả. */
public enum SuggestionFilter {
    OPEN(List.of(SuggestionStatus.OPEN)),
    CLOSED(SuggestionStatus.CLOSED),
    ALL(Arrays.asList(SuggestionStatus.values()));

    private final List<SuggestionStatus> statuses;

    SuggestionFilter(List<SuggestionStatus> statuses) {
        this.statuses = statuses;
    }

    public List<SuggestionStatus> statuses() {
        return statuses;
    }
}
