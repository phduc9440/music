package com.ptit.music_be.dto.response;

import java.util.List;

import com.ptit.music_be.dto.enums.AiTaskStatus;

import lombok.*;
import lombok.experimental.FieldDefaults;

/**
 * Kết quả của lần nhận diện (OMR) mới nhất của một bản nhạc (đặc tả mục 2.3 và 7.2). Màn hình review dùng để vẽ
 * tóm tắt, ảnh từng trang, danh sách cảnh báo và tab Kern.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class OmrResultResponse {

    /** Task OMR mới nhất của bản nhạc. */
    String taskId;

    AiTaskStatus status;

    /** Số trang đã nhận diện (từ result_data.pageCount, không có thì bằng số ảnh trang). */
    Integer pageCount;

    /** Cảnh báo theo thứ tự phát sinh, ví dụ "Trang 2: số ô nhịp tay phải và tay trái lệch nhau". */
    List<String> warnings;

    /** Bước cuối pipeline đã chạy nếu task dừng sớm (result_data.stoppedAfter), ví dụ MERGE; null nếu chạy đủ. */
    String stoppedAfter;

    /** Ảnh từng trang đã tiền xử lý, theo số trang tăng dần. */
    List<Page> pages;

    /** Id các file hiện hành (is_current), null nếu chưa có. */
    String kernFileId;

    String musicXmlFileId;
    String midiFileId;

    /** Một trang đã tiền xử lý. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class Page {
        Integer pageNumber;
        String imageFileId;
    }
}
