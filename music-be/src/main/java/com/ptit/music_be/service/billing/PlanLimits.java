package com.ptit.music_be.service.billing;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Hạn mức của một gói (đọc từ cột JSON {@code plans.limits}). Số nguyên null hoặc thiếu khóa = không giới hạn; cờ
 * thiếu = không có quyền lợi đó.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record PlanLimits(
        Integer omrPagesPerMonth,
        Integer omrConcurrent,
        Integer storageMb,
        Integer keptVersions,
        Integer exportsPerMonth,
        Boolean collab,
        Boolean team,
        Boolean omrPriority) {}
