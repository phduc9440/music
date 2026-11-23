package com.ptit.music_be.exception.code;

import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;

import com.ptit.music_be.exception.ErrorCode;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.experimental.FieldDefaults;

/** Thẻ, danh sách phát, luyện tập (23xx, 26xx, 30xx). */
@Getter
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public enum LibraryErrorCode implements ErrorCode {
    // Tags (23xx)
    TAG_NOT_EXISTED(2301, "Thể loại không tồn tại", HttpStatus.NOT_FOUND),
    TAG_NAME_INVALID(2303, "Tên thể loại là bắt buộc và tối đa 50 ký tự", HttpStatus.BAD_REQUEST),
    TAG_DUPLICATED(2304, "Thể loại này đã tồn tại", HttpStatus.CONFLICT),
    TOO_MANY_TAGS(2302, "Mỗi bản nhạc tối đa 10 thể loại", HttpStatus.BAD_REQUEST),
    // Playlists (26xx)
    PLAYLIST_NOT_EXISTED(2601, "Playlist không tồn tại", HttpStatus.NOT_FOUND),
    PLAYLIST_NAME_INVALID(2602, "Tên playlist là bắt buộc và tối đa 255 ký tự", HttpStatus.BAD_REQUEST),
    PLAYLIST_DESCRIPTION_INVALID(2603, "Mô tả playlist tối đa 2000 ký tự", HttpStatus.BAD_REQUEST),
    PLAYLIST_SCORE_DUPLICATED(2604, "Bản nhạc đã có trong playlist", HttpStatus.CONFLICT),
    PLAYLIST_SCORE_NOT_IN_PLAYLIST(2605, "Bản nhạc không có trong playlist", HttpStatus.NOT_FOUND),
    PLAYLIST_ORDER_INVALID(2606, "Danh sách thứ tự không khớp với các bài trong playlist", HttpStatus.BAD_REQUEST),
    NOTIFICATION_NOT_EXISTED(2501, "Thông báo không tồn tại", HttpStatus.NOT_FOUND),
    NOTIFICATION_CATEGORY_LOCKED(2502, "Nhóm thông báo này luôn bật, không chỉnh được", HttpStatus.BAD_REQUEST),
    // Practice sessions 30xx
    PRACTICE_SESSION_NOT_EXISTED(3001, "Phiên tập không tồn tại", HttpStatus.NOT_FOUND),
    PRACTICE_SESSION_INVALID(3002, "Dữ liệu phiên tập không hợp lệ", HttpStatus.BAD_REQUEST),
    PRACTICE_STATS_DAYS_INVALID(3005, "Số ngày thống kê phải từ 7 đến 90", HttpStatus.BAD_REQUEST),
    PRACTICE_STATS_PERIOD_INVALID(3004, "Chu kỳ thống kê phải là DAY, WEEK hoặc MONTH", HttpStatus.BAD_REQUEST),
    PRACTICE_STATS_RANGE_INVALID(3003, "Khoảng ngày thống kê không hợp lệ (tối đa 400 ngày)", HttpStatus.BAD_REQUEST),
    STUDIO_SESSION_ALREADY_ACTIVE(3010, "Bạn đang có một phiên luyện tập đang chạy", HttpStatus.CONFLICT),
    STUDIO_SESSION_NOT_ACTIVE(3011, "Phiên luyện tập không còn hoạt động", HttpStatus.CONFLICT),
    STUDIO_SESSION_NOT_EXISTED(3012, "Phiên luyện tập không tồn tại", HttpStatus.NOT_FOUND),
    STUDIO_EVENT_BATCH_TOO_LARGE(3013, "Một lô sự kiện luyện tập tối đa 200 phần tử", HttpStatus.PAYLOAD_TOO_LARGE),
    STUDIO_EVENT_INVALID(3014, "Dữ liệu sự kiện luyện tập không hợp lệ", HttpStatus.BAD_REQUEST),
    STUDIO_REPORT_NOT_READY(3015, "Báo cáo phiên luyện tập chưa sẵn sàng", HttpStatus.CONFLICT),
    ;

    int code;
    String message;
    HttpStatusCode httpStatusCode;

    LibraryErrorCode(int code, String message, HttpStatusCode httpStatusCode) {
        this.code = code;
        this.message = message;
        this.httpStatusCode = httpStatusCode;
    }
}
