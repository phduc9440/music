package com.ptit.music_be.dto.response.reward;

import java.time.LocalDateTime;
import java.util.List;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Điểm thưởng của tôi (X-02): tổng XP, số Nốt và 20 lần cộng gần nhất. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class PointsResponse {
    long xp;
    long notes;
    List<Entry> recent;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class Entry {
        /** RewardReason; web dịch theo ngôn ngữ người đọc. */
        String reason;

        String refId;
        int xp;
        int notes;
        LocalDateTime createdAt;
    }
}
