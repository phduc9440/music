package com.ptit.music_be.exception.code;

import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;

import com.ptit.music_be.exception.ErrorCode;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.experimental.FieldDefaults;

/** Bản nhạc, file/OMR, phiên bản, vòng đời, xuất file (2xxx, 27xx-29xx, 33xx). */
@Getter
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public enum ScoreErrorCode implements ErrorCode {
    // Score files & OMR (2xxx)
    SCORE_NOT_EXISTED(2001, "Bản nhạc không tồn tại", HttpStatus.NOT_FOUND),
    FILE_NOT_EXISTED(2002, "File không tồn tại", HttpStatus.NOT_FOUND),
    FILE_EMPTY(2003, "File tải lên bị rỗng", HttpStatus.BAD_REQUEST),
    FILE_TYPE_NOT_SUPPORTED(2004, "Chỉ hỗ trợ file PDF, PNG, JPG, JPEG", HttpStatus.BAD_REQUEST),
    FILE_TOO_LARGE(2005, "File tải lên quá lớn", HttpStatus.PAYLOAD_TOO_LARGE),
    INVALID_UPLOAD_COMBINATION(2006, "Chỉ tải lên đúng 1 file PDF hoặc từ 1 đến 20 ảnh", HttpStatus.BAD_REQUEST),
    FILE_STORAGE_ERROR(2007, "Không lưu được file", HttpStatus.INTERNAL_SERVER_ERROR),
    PDF_ENCRYPTED(2008, "PDF đặt mật khẩu nên không mở được", HttpStatus.BAD_REQUEST),
    PDF_TOO_MANY_PAGES(2009, "PDF phải có từ 1 đến 20 trang", HttpStatus.BAD_REQUEST),
    /** Mã giữ tên cũ để không đổi API: nay chỉ dùng cho ảnh không đọc được, ảnh nhỏ/lớn có mã riêng 2032, 2033. */
    IMAGE_RESOLUTION_INVALID(2010, "Không đọc được ảnh, file có thể bị hỏng", HttpStatus.BAD_REQUEST),
    PDF_UNREADABLE(2031, "Không đọc được PDF, file có thể bị hỏng", HttpStatus.BAD_REQUEST),
    IMAGE_TOO_SMALL(2032, "Ảnh quá nhỏ: cạnh ngắn phải từ 600px", HttpStatus.BAD_REQUEST),
    IMAGE_TOO_LARGE(2033, "Ảnh quá lớn: tối đa 40 megapixel", HttpStatus.BAD_REQUEST),
    INVALID_SOURCE_TYPE(2011, "Loại nguồn phải là PHOTO, SCAN hoặc PDF_NATIVE", HttpStatus.BAD_REQUEST),
    MUSICXML_NOT_READY(
            2012, "Bản nhạc chưa có MusicXML, hãy đợi nhận diện xong hoặc nhận diện lại", HttpStatus.CONFLICT),
    MUSICXML_INVALID(2013, "Nội dung MusicXML không hợp lệ, hãy tải lại trang rồi thử lưu lại", HttpStatus.BAD_REQUEST),
    SCORE_VERSION_CONFLICT(
            2014,
            "Bản nhạc vừa được lưu ở nơi khác, hãy tải bản mới nhất hoặc ghi đè bản của bạn",
            HttpStatus.CONFLICT),
    MUSICXML_FILE_INVALID(2015, "File MusicXML không hợp lệ hoặc bị hỏng", HttpStatus.BAD_REQUEST),
    MIDI_INVALID(2016, "File MIDI không hợp lệ hoặc bị hỏng", HttpStatus.BAD_REQUEST),
    IMPORT_TYPE_NOT_SUPPORTED(
            2030, "Chỉ hỗ trợ một file .musicxml, .xml, .mxl, .mid hoặc .midi", HttpStatus.BAD_REQUEST),
    SCORE_TITLE_INVALID(2017, "Tiêu đề là bắt buộc và tối đa 255 ký tự", HttpStatus.BAD_REQUEST),
    SCORE_COMPOSER_INVALID(2018, "Tên tác giả tối đa 255 ký tự", HttpStatus.BAD_REQUEST),
    SCORE_NOTES_INVALID(2019, "Ghi chú tối đa 5000 ký tự", HttpStatus.BAD_REQUEST),
    INVALID_FILTER(2020, "Giá trị bộ lọc không hợp lệ", HttpStatus.BAD_REQUEST),
    SCORE_NOT_PUBLIC_FOR_OFFICIAL(2022, "Chỉ đưa vào kho bản nhạc mẫu được bản nhạc đã công khai", HttpStatus.CONFLICT),
    SCORE_OFFICIAL_LOCKED(2023, "Bản nhạc trong kho bản nhạc mẫu chỉ ADMIN được xóa", HttpStatus.FORBIDDEN),
    SCORE_NOT_PENDING_PUBLIC(2021, "Bản nhạc này không ở trạng thái chờ duyệt công khai", HttpStatus.CONFLICT),
    SCORE_COVER_INVALID(2025, "Ảnh bìa phải là JPG hoặc PNG, tối đa 3MB", HttpStatus.BAD_REQUEST),
    SCORE_LICENSE_REQUIRED(
            2026, "Chọn giấy phép khác \"Bảo lưu mọi quyền\" thì mới cho phép tạo bản phối", HttpStatus.BAD_REQUEST),
    SCORE_FORK_NOT_ALLOWED(
            2027,
            "Bản nhạc này không cho phép tạo bản phối (chưa công khai hoặc chủ chưa cho phép)",
            HttpStatus.FORBIDDEN),
    SCORE_FORK_RATE_LIMITED(
            2028, "Bạn đã tạo quá 20 bản phối trong 24 giờ, hãy thử lại sau", HttpStatus.TOO_MANY_REQUESTS),
    SCORE_LICENSE_LOCKED(
            2029,
            "Bản phối giữ nguyên giấy phép của bản gốc (CC BY-SA hoặc CC BY-NC), không đổi được",
            HttpStatus.CONFLICT),
    SCORE_NOT_PUBLIC(2024, "Bản nhạc này chưa được công khai nên không thể gỡ", HttpStatus.CONFLICT),
    SCORE_BUSY(2201, "Bản nhạc đang được xử lý, vui lòng thử lại sau", HttpStatus.CONFLICT),
    TASK_LIMIT_EXCEEDED(
            2202,
            "Bạn đang có 3 tác vụ OMR chờ hoặc đang chạy, hãy đợi một tác vụ hoàn tất",
            HttpStatus.TOO_MANY_REQUESTS),
    // Export 27xx
    EXPORT_OPTION_INVALID(2701, "Tùy chọn xuất file không hợp lệ", HttpStatus.BAD_REQUEST),
    AUDIO_TOO_LONG(2702, "Bản nhạc quá dài để xuất âm thanh (tối đa 20 phút), hãy tăng tempo", HttpStatus.BAD_REQUEST),
    EXPORT_LIMIT_EXCEEDED(
            2703,
            "Bạn đang xuất quá nhiều file, vui lòng đợi các tác vụ xuất đang chạy hoàn tất",
            HttpStatus.TOO_MANY_REQUESTS),
    EXPORT_NOT_AVAILABLE(2704, "Tính năng xuất file chưa sẵn sàng trên máy chủ", HttpStatus.SERVICE_UNAVAILABLE),
    EXPORT_SOURCE_NOT_SUPPORTED(2705, "Bản nhạc không có nguồn phù hợp để chuyển đổi", HttpStatus.CONFLICT),
    // Score versions 28xx
    SCORE_VERSION_NOT_EXISTED(2801, "Phiên bản bản nhạc không tồn tại hoặc đã bị xóa", HttpStatus.NOT_FOUND),
    // Score diff 29xx
    SCORE_DIFF_NO_BASE(
            2901,
            "Không có phiên bản do nhận diện sinh ra để so sánh (đã quá 20 phiên bản hoặc bản nhạc không từ OMR)",
            HttpStatus.NOT_FOUND),
    SCORE_DIFF_SAME_VERSION(2902, "Không thể so sánh một phiên bản với chính nó", HttpStatus.BAD_REQUEST),
    SCORE_DIFF_FAILED(
            2903, "Không so sánh được hai phiên bản (MusicXML không đọc được)", HttpStatus.UNPROCESSABLE_ENTITY),
    // Score lifecycle 33xx
    OFFICIAL_REQUEST_NOT_EXISTED(3401, "Lời xin đưa vào kho bản nhạc mẫu không tồn tại", HttpStatus.NOT_FOUND),
    OFFICIAL_REQUEST_NOT_PENDING(3402, "Lời xin này đã được xử lý", HttpStatus.CONFLICT),
    OFFICIAL_REQUEST_DUPLICATED(3403, "Bản nhạc này đang có lời xin chờ chủ sở hữu trả lời", HttpStatus.CONFLICT),
    SCORE_ALREADY_OFFICIAL(3404, "Bản nhạc này đã nằm trong kho bản nhạc mẫu", HttpStatus.CONFLICT),
    SCORE_SYSTEM_OWNER_MISSING(
            3405, "Chưa có tài khoản hệ thống để chứa bản nhạc của kho bản nhạc mẫu", HttpStatus.INTERNAL_SERVER_ERROR),
    SCORE_NOT_IN_TRASH(3301, "Bản nhạc không nằm trong thùng rác của bạn", HttpStatus.NOT_FOUND),
    BLANK_SCORE_OPTION_INVALID(
            3302,
            "Tùy chọn bản nhạc trống không hợp lệ (khóa -7..7, tử số nhịp 1..12, mẫu số 2/4/8/16, tempo 20..300,"
                    + " 1..200 ô)",
            HttpStatus.BAD_REQUEST),
    COMPOSER_NOT_EXISTED(3501, "Nhạc sĩ không tồn tại", HttpStatus.NOT_FOUND),
    COMPOSER_NAME_INVALID(3502, "Tên nhạc sĩ là bắt buộc và tối đa 255 ký tự", HttpStatus.BAD_REQUEST),
    COMPOSER_DUPLICATED(3503, "Đã có nhạc sĩ trùng tên (đường dẫn)", HttpStatus.CONFLICT),
    COMPOSER_YEARS_INVALID(3504, "Năm sinh, năm mất không hợp lệ", HttpStatus.BAD_REQUEST),
    COMPOSER_IMAGE_INVALID(3505, "Ảnh phải là đường dẫn https và có ghi nguồn, giấy phép", HttpStatus.BAD_REQUEST),
    COMPOSER_FIELD_TOO_LONG(3506, "Thông tin nhạc sĩ vượt quá độ dài cho phép", HttpStatus.BAD_REQUEST),
    ;

    int code;
    String message;
    HttpStatusCode httpStatusCode;

    ScoreErrorCode(int code, String message, HttpStatusCode httpStatusCode) {
        this.code = code;
        this.message = message;
        this.httpStatusCode = httpStatusCode;
    }
}
