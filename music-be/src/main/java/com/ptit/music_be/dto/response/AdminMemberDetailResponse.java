package com.ptit.music_be.dto.response;

import java.time.LocalDateTime;
import java.util.List;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Chi tiết một thành viên cho admin: hồ sơ, số liệu hoạt động và các bản nhạc gần đây. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class AdminMemberDetailResponse {

    MemberResponse member;
    long scoreCount;
    long publicScores;
    long pendingScores;
    long playlistCount;
    long reviewCount;
    long practiceSessions;
    double practiceMinutes;
    /** 10 bản nhạc cập nhật gần nhất. */
    List<RecentScore> recentScores;

    /** Tổng tiền các đơn mua gói đã thanh toán (PAID, không tính đơn đã hoàn), VND. */
    long purchaseTotal;
    long purchaseCount;
    /** Đơn đã hoàn tiền (không tính vào purchaseTotal). */
    long refundedTotal;
    long refundedCount;
    /** Các lần mua gói đã thanh toán (PAID và REFUNDED), mới nhất trước, tối đa 50. */
    List<Purchase> purchases;

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class Purchase {
        String orderCode;
        String planName;
        /** MONTH / YEAR. */
        String period;
        /** NEW / RENEW. */
        String kind;
        /** PAID / REFUNDED. */
        String status;
        long amount;
        LocalDateTime paidAt;
    }

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class RecentScore {
        String id;
        String title;
        String composer;
        String visibility;
        Boolean isOfficial;
        LocalDateTime updatedAt;
    }
}
