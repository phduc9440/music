package com.ptit.music_be.dto.response.ai;

import java.util.List;

import com.fasterxml.jackson.databind.JsonNode;
import com.ptit.music_be.dto.enums.ai.AiTaskStatus;

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

    /**
     * Cảnh báo dạng cấu trúc (result_data.warningItems, OMR-11): mỗi mục {code, page, system, measure, params, text}. Web dựng
     * câu theo ngôn ngữ từ code + params, nhảy tới trang theo page; text (tiếng Việt) là bản dự phòng. Null với kết quả cũ.
     */
    JsonNode warningItems;

    /**
     * Những chỗ máy đã tự sửa (result_data.autoFixes, OMR-14), tách khỏi cảnh báo: mỗi mục {code, page, measures, params,
     * text}. Các ô này cũng có cờ AUTO_FIXED trong measureMap để người dùng kiểm lại. Null với kết quả cũ.
     */
    JsonNode autoFixes;

    /** Bản gốc có chữ phía trên khuông (tên hợp âm, nhịp độ...) mà hệ thống chưa đọc (OMR-13); null với kết quả cũ. */
    JsonNode textAbove;

    /** Nhịp độ không đọc được từ bản gốc nên đang dùng mặc định (OMR-13); null với kết quả cũ. */
    Boolean tempoDefaulted;

    /**
     * Tên bài, tác giả, nhịp độ đọc từ lớp chữ của PDF xuất từ phần mềm chép nhạc (result_data.pageText: {title, composer,
     * tempoBpm}, thiếu khóa nào thì không đọc được khóa đó). Web gợi ý tên bài từ đây. Null với ảnh, PDF scan, kết quả cũ.
     */
    JsonNode pageText;

    /**
     * Phiên bản MusicXML do chính lần nhận diện này tạo (result_data.musicXmlVersion). Khác {@link #musicXmlVersion} nghĩa
     * là bản nhạc đã được lưu thêm sau khi số hóa, số ô trong measureMap có thể lệch nếu người dùng thêm/xóa ô.
     */
    Integer omrVersion;

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

        /**
         * DURATION (tổng trường độ sai số chỉ nhịp), COUNT_MISMATCH (số ô của hệ/trang lệch số ô trên ảnh), RANGE (nốt
         * giọng hát ngoài tầm thường gặp), LEAP (bước nhảy/nốt vọt bất thường), ACCIDENTAL (dấu hóa lạ chỉ xuất hiện một
         * lần), UNSTABLE (các lần đọc lại cho kết quả khác nhau), AI_DOUBT (AI xác minh cho là sai), AUTO_FIXED (máy đã
         * tự sửa ô này, cần đối chiếu lại với ảnh, OMR-14).
         */
        List<String> flags;

        /** Độ tin cậy 0..1 do music-ai chấm (null với kết quả cũ). */
        Double confidence;

        /** Lý do cần kiểm tra (tiếng Việt), rỗng nếu ô ổn. */
        List<String> reasons;
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

        /** Số ô có ít nhất một cờ cần kiểm tra (result_data.measureCheck.review.flagged), null với kết quả cũ. */
        Integer flaggedMeasures;

        /** Số ô có độ tin cậy dưới 0,8 (result_data.measureCheck.review.lowConfidence), null với kết quả cũ. */
        Integer lowConfidenceMeasures;
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
