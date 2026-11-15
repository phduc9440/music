package com.ptit.music_be.dto.request.ai;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;

/** Body của {@code POST /internal/ai-tasks/{taskId}/fail}. Kết quả lưu vào error_message dạng "MÃ: message". */
@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class AiTaskFailRequest {

    /** Mã lỗi, xem {@code AiTaskError} (ví dụ PAGE_UNREADABLE, NO_STAFF_DETECTED). */
    @NotBlank(message = "INVALID_REQUEST")
    @Size(max = 64, message = "INVALID_REQUEST")
    String errorCode;

    /** Chi tiết thêm (ví dụ "trang 3"), có thể để trống. */
    @Size(max = 1000, message = "INVALID_REQUEST")
    String message;
}
