package com.ptit.music_be.exception.code;

import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;

import com.ptit.music_be.exception.ErrorCode;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.experimental.FieldDefaults;

/** Báo cáo vi phạm và diễn đàn (40xx, 41xx). */
@Getter
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public enum CommunityErrorCode implements ErrorCode {
    // ---- 40xx: Báo cáo vi phạm và nhật ký quản trị (R5)
    REPORT_NOT_EXISTED(4001, "Không tìm thấy báo cáo", HttpStatus.NOT_FOUND),
    REPORT_REASON_INVALID(
            4002,
            "Hãy chọn lý do báo cáo; chi tiết tối đa 1000 ký tự và bắt buộc khi chọn lý do Khác",
            HttpStatus.BAD_REQUEST),
    REPORT_OWN_CONTENT(4003, "Bạn không báo cáo được nội dung của chính mình", HttpStatus.BAD_REQUEST),
    REPORT_DUPLICATED(4004, "Bạn đã báo cáo nội dung này và báo cáo đang chờ xử lý", HttpStatus.CONFLICT),
    REPORT_RATE_LIMITED(4005, "Bạn báo cáo quá nhiều trong 24 giờ qua, hãy thử lại sau", HttpStatus.TOO_MANY_REQUESTS),
    REPORT_TARGET_UNSUPPORTED(4006, "Loại nội dung này chưa nhận báo cáo", HttpStatus.BAD_REQUEST),
    REPORT_ALREADY_HANDLED(4007, "Báo cáo này đã được xử lý", HttpStatus.CONFLICT),
    REPORT_ACTION_INVALID(4008, "Cách xử lý này không áp dụng cho loại nội dung bị báo cáo", HttpStatus.BAD_REQUEST),
    REPORT_TARGET_GONE(4009, "Nội dung bị báo cáo không còn nữa; chỉ chọn được Bỏ qua", HttpStatus.CONFLICT),
    REPORT_NOTE_INVALID(4010, "Ghi chú xử lý tối đa 500 ký tự", HttpStatus.BAD_REQUEST),
    // ---- 41xx: Diễn đàn (mục 5.5)
    FORUM_CATEGORY_NOT_EXISTED(4101, "Không tìm thấy chuyên mục", HttpStatus.NOT_FOUND),
    FORUM_THREAD_NOT_EXISTED(4102, "Không tìm thấy chủ đề", HttpStatus.NOT_FOUND),
    FORUM_POST_NOT_EXISTED(4103, "Không tìm thấy bài trả lời", HttpStatus.NOT_FOUND),
    FORUM_CONTENT_INVALID(4104, "Tiêu đề từ 3 đến 150 ký tự, nội dung từ 1 đến 10000 ký tự", HttpStatus.BAD_REQUEST),
    FORUM_SCORE_NOT_PUBLIC(4105, "Chỉ gắn được bản nhạc đang công khai vào chủ đề", HttpStatus.BAD_REQUEST),
    FORUM_NOT_AUTHOR(4106, "Bạn không phải người viết nội dung này", HttpStatus.FORBIDDEN),
    FORUM_NEW_ACCOUNT_LIMIT(
            4107, "Tài khoản dưới 3 ngày tuổi chỉ đặt được tối đa 3 chủ đề mỗi ngày", HttpStatus.TOO_MANY_REQUESTS),
    FORUM_THREAD_HAS_REPLIES(
            4108,
            "Chủ đề đã có người khác trả lời nên không xóa được, hãy báo quản trị viên nếu cần gỡ",
            HttpStatus.CONFLICT),
    FORUM_ACCEPT_OWN_POST(4109, "Bạn không chọn được câu trả lời của chính mình", HttpStatus.BAD_REQUEST),
    FORUM_VOTE_OWN_CONTENT(4110, "Bạn không bình chọn được nội dung của chính mình", HttpStatus.BAD_REQUEST),
    FORUM_THREAD_LOCKED(4111, "Chủ đề đã bị khóa, không trả lời thêm được", HttpStatus.FORBIDDEN),
    FORUM_CATEGORY_NOT_EMPTY(
            4112, "Chuyên mục còn chủ đề nên không xóa được, hãy chuyển hoặc ẩn các chủ đề trước", HttpStatus.CONFLICT),
    FORUM_CATEGORY_INVALID(4113, "Tên chuyên mục từ 2 đến 100 ký tự, mô tả tối đa 300 ký tự", HttpStatus.BAD_REQUEST),
    FORUM_CATEGORY_SLUG_TAKEN(4114, "Đã có chuyên mục trùng đường dẫn, hãy đổi tên khác", HttpStatus.CONFLICT),
    ;

    int code;
    String message;
    HttpStatusCode httpStatusCode;

    CommunityErrorCode(int code, String message, HttpStatusCode httpStatusCode) {
        this.code = code;
        this.message = message;
        this.httpStatusCode = httpStatusCode;
    }
}
