package com.ptit.music_be.service.export;

import java.util.List;

import com.ptit.music_be.dto.request.ExportRequest;
import com.ptit.music_be.dto.response.ExportFileResponse;
import com.ptit.music_be.dto.response.ExportResponse;

/** API xuất file chung (đặc tả 5.2): MP3/WAV ở nhánh export-audio, các định dạng khác thêm sau. */
public interface ExportService {

    /**
     * Yêu cầu xuất một định dạng. Có file cùng tùy chọn và cùng version MusicXML thì trả ngay ({@code cached}); đang có
     * task trùng thì trả lại task đó; ngược lại tạo task mới chạy nền.
     */
    ExportResponse requestExport(String scoreId, ExportRequest request);

    /**
     * Chuyển bản nhạc nhập từ MIDI thành MusicXML: tạo task chạy MuseScore trên {@code ORIGINAL_MIDI} rồi chuẩn hóa,
     * kết quả là MusicXML version 1 để mở được Editor và Player. Cần quyền sửa. Lỗi: SCORE_NOT_EXISTED (2001),
     * UNAUTHORIZED (1002), EXPORT_SOURCE_NOT_SUPPORTED (2705) nếu bản nhạc đã có MusicXML hoặc không có MIDI gốc,
     * EXPORT_NOT_AVAILABLE (2704), EXPORT_LIMIT_EXCEEDED (2703). Đang có task chuyển đổi thì trả lại task đó.
     *
     * <p>Cũng được gọi khi {@code POST /exports} với {@code targetFormat = MUSICXML} và bản nhạc chưa có MusicXML.
     */
    ExportResponse requestMidiConversion(String scoreId);

    /** File xuất còn trên đĩa của bản nhạc, kèm cờ {@code outdated}. Cần quyền xem. */
    List<ExportFileResponse> listExports(String scoreId);

    /** ZIP chứa mọi trang SVG của một lần xuất. */
    record SvgZip(String fileName, byte[] content) {}

    /**
     * Gom các trang SVG do tác vụ {@code taskId} tạo ra thành một file ZIP (tên trang {@code {tiêu đề}-trang-01.svg}).
     * Cần quyền xem. Lỗi: SCORE_NOT_EXISTED (2001), UNAUTHORIZED (1002), FILE_NOT_EXISTED (2002) nếu tác vụ không có
     * trang nào còn trên đĩa.
     */
    SvgZip zipSvgPages(String scoreId, String taskId);
}
