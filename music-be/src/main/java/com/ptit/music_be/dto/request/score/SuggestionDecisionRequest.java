package com.ptit.music_be.dto.request.score;

import java.util.List;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Nhận hoặc từ chối một đề xuất sửa (mục 4.3). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class SuggestionDecisionRequest {
    /** Id các ô được nhận; null là nhận tất cả (bắt buộc với đề xuất đổi cấu trúc). Bỏ qua khi từ chối. */
    List<String> changeIds;
    /** Ghi chú cho người đề xuất, tối đa 500 ký tự. */
    String note;
}
