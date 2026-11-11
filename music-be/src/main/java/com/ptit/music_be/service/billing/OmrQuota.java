package com.ptit.music_be.service.billing;

import java.time.YearMonth;

import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.enums.AiTaskType;
import com.ptit.music_be.dto.enums.UsageMetric;
import com.ptit.music_be.entity.AiTask;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Hoàn lại trang OMR đã trừ khi task lỗi hoặc bị hủy. Số trang đã trừ nằm trong {@code input_data.pagesCharged} của
 * task (0 hoặc thiếu khi không trừ, ví dụ admin chạy lại), nên không bao giờ hoàn nhiều hơn số đã trừ.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OmrQuota {

    public static final String PAGES_CHARGED_KEY = "pagesCharged";

    private final EntitlementService entitlementService;
    private final ObjectMapper objectMapper;

    public void refund(AiTask task) {
        if (task.getTaskType() != AiTaskType.OMR_CONVERSION
                || task.getInputData() == null
                || task.getMember() == null
                || task.getCreatedAt() == null) {
            return;
        }
        try {
            JsonNode input = objectMapper.readTree(task.getInputData());
            int pages = input.path(PAGES_CHARGED_KEY).asInt(0);
            if (pages > 0) {
                entitlementService.release(
                        task.getMember().getId(),
                        UsageMetric.OMR_PAGES,
                        pages,
                        YearMonth.from(task.getCreatedAt()).toString());
            }
        } catch (Exception e) {
            log.warn("Không hoàn được hạn mức OMR của task {}", task.getId(), e);
        }
    }
}
