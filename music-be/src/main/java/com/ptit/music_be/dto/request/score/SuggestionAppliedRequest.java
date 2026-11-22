package com.ptit.music_be.dto.request.score;

import lombok.*;
import lombok.experimental.FieldDefaults;

/**
 * Báo một đề xuất đã được áp dụng trong trình chỉnh sửa: người sửa nạp đề xuất làm bản nháp, chỉnh lại rồi tự lưu thành
 * {@code version}. Đề xuất đóng ở trạng thái ACCEPTED, không lưu thêm phiên bản nào.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class SuggestionAppliedRequest {
    /** Phiên bản vừa lưu có chứa đề xuất: lớn hơn phiên bản gốc của đề xuất và không quá phiên bản hiện hành. */
    Integer version;
}
