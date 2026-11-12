package com.ptit.music_be.dto.response.admin;

import java.time.LocalDate;
import java.util.List;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Doanh thu trong khoảng ngày: tính đơn PAID; đơn REFUNDED tách riêng. Số tiền VND. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class RevenueResponse {
    LocalDate from;
    LocalDate to;
    long totalAmount;
    long orderCount;
    long refundedAmount;
    long refundedCount;
    List<Day> byDay;
    List<ByPlan> byPlan;

    public record Day(LocalDate date, long amount, long count) {}

    public record ByPlan(String planCode, String planName, long amount, long count) {}
}
