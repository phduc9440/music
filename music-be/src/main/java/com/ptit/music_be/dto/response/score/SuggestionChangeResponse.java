package com.ptit.music_be.dto.response.score;

import com.ptit.music_be.dto.enums.score.SuggestionChangeStatus;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Một ô nhịp khác nhau trong đề xuất sửa. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class SuggestionChangeResponse {
    String id;
    int partIndex;
    /** Tên part; thiếu thì là id part. */
    String partName;
    /** Thứ tự ô trong part, từ 0. */
    int measureIndex;
    /** Số ô để hiển thị. */
    String measureNumber;

    SuggestionChangeStatus status;
    /** Bản chính đã sửa ô này sau khi đề xuất (chỉ tính khi đề xuất còn mở): nhận sẽ thay bản hiện tại. */
    boolean conflict;
}
