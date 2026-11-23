package com.ptit.music_be.dto.response.billing;

/** Dữ liệu kèm lỗi PLAN_LIMIT_REACHED để web hiện hộp "Nâng cấp". {@code upgradeTo} null nếu đã ở gói cao nhất. */
public record PlanLimitPayload(String metric, Integer limit, int used, String upgradeTo) {}
