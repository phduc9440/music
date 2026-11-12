package com.ptit.music_be.dto.request.ai;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;

/** Body tùy chọn của {@code POST /api/scores/{scoreId}/omr/retry}. */
@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class OmrRetryRequest {

    /** Có tiền xử lý ảnh không. Để trống: dùng lại lựa chọn của lần chạy trước (mặc định true). */
    Boolean preprocess;
}
