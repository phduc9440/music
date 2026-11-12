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

    /** Version của MusicXML hiện hành (ETag "v{n}" của GET /musicxml), null nếu chưa có MusicXML. */
    Integer musicXmlVersion;

    /**
     * Bản đồ ô nhịp (result_data.measureMap do music-ai ghi): mỗi ô của bản nhận diện nằm ở trang nào, hệ nào, khung nào
     * trên ảnh trang, và cờ cần kiểm tra. Rỗng nếu task cũ hoặc dừng trước bước ghép.
     */
    List<MeasureEntry> measureMap;

    /** So số ô đếm trên ảnh với số ô đọc được (result_data.measureCheck), null nếu chưa có. */
    MeasureCheck measureCheck;

    /** Một ô nhịp của bản nhận diện. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class MeasureEntry {
        /** Số ô nhịp trong MusicXML (đánh số liên tục từ 1). */
        Integer measure;

        Integer page;

        /** Số thứ tự hệ trên trang (từ 1), null nếu chưa biết chắc ô thuộc hệ nào. */
        Integer system;

        /** Khung ô trên ảnh trang đã tiền xử lý [x0, y0, x1, y1], null nếu chưa biết. */
        List<Integer> box;

        /** DURATION (tổng trường độ sai số chỉ nhịp), COUNT_MISMATCH (số ô của hệ/trang lệch số ô trên ảnh). */
        List<String> flags;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class MeasureCheck {
        /** Số ô đếm trên ảnh (null nếu không chắc). */
        Integer imageMeasures;

        /** Số ô trong bản kern đã ghép. */
        Integer kernMeasures;
    }

    /** Một trang đã tiền xử lý. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class Page {
        Integer pageNumber;
        String imageFileId;

        /**
         * Số ô nhịp đầu và cuối của trang trong MusicXML (đánh số liên tục từ 1), để vẽ đúng phần nhạc của trang bên
         * cạnh ảnh gốc. Null nếu music-ai chưa báo (ví dụ task dừng trước bước xuất).
         */
        Integer firstMeasure;

        Integer lastMeasure;
    }
}
