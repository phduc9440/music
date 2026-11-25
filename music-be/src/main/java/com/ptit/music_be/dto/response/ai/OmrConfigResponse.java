package com.ptit.music_be.dto.response.ai;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;

/**
 * Giới hạn của hệ thống cho một lần số hóa và các thông tin trang tải lên cần hiện cho người dùng (OMR-04, X-05). Hạn mức
 * theo gói nằm ở {@code GET /subscriptions/me}; trần thật của một lần là số nhỏ hơn giữa gói và các số ở đây.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class OmrConfigResponse {

    /** Số trang PDF tối đa một lần (app.omr.max-pdf-pages). */
    Integer maxPdfPages;

    /** Số ảnh tối đa một lần (app.omr.max-images). */
    Integer maxImages;

    /** Cạnh ngắn tối thiểu của ảnh (px). */
    Integer minImageSide;

    /** Số điểm ảnh tối đa của một ảnh. */
    Long maxImagePixels;

    /**
     * true khi music-ai được bật bước AI xác minh ô nhịp qua dịch vụ bên ngoài (OMR_LLM khác off): ảnh cắt của một số ô
     * nhịp được gửi ra ngoài, trang tải lên phải báo cho người dùng.
     */
    Boolean externalAiCheck;
}
