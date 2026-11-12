package com.ptit.music_be.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import com.ptit.music_be.dto.enums.AiTaskStep;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;

/**
 * Body của {@code POST /internal/ai-tasks/{taskId}/progress} (đặc tả mục 6.3). Message của annotation phải là tên một
 * ErrorCode (GlobalExceptionHandler dùng ErrorCode.valueOf).
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class AiTaskProgressRequest {

    /** 0-100 và không được nhỏ hơn tiến độ đã ghi. */
    @NotNull(message = "INVALID_REQUEST")
    @Min(value = 0, message = "INVALID_REQUEST")
    @Max(value = 100, message = "INVALID_REQUEST")
    Integer progress;

    AiTaskStep step;
}
