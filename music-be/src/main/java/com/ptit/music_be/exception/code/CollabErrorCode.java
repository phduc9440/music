package com.ptit.music_be.exception.code;

import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;

import com.ptit.music_be.exception.ErrorCode;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.experimental.FieldDefaults;

/** Chia sẻ, góp ý, đề xuất sửa, đồng chỉnh sửa (24xx, 31xx, 39xx). */
@Getter
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public enum CollabErrorCode implements ErrorCode {
    // Sharing & reviews (24xx)
    ACCESS_REQUEST_NOT_EXISTED(2402, "Không có yêu cầu xin quyền nào đang chờ", HttpStatus.NOT_FOUND),
    ALREADY_HAS_ACCESS(
            2404,
            "Bạn đã có quyền này hoặc cao hơn với bản nhạc (bản nhạc công khai thì ai cũng xem và nhận xét được)",
            HttpStatus.BAD_REQUEST),
    CANNOT_SHARE_WITH_OWNER(2406, "Không thể chia sẻ bản nhạc cho chính chủ sở hữu", HttpStatus.BAD_REQUEST),
    SHARE_MEMBER_NOT_EXISTED(2407, "Người này chưa có quyền với bản nhạc", HttpStatus.NOT_FOUND),
    SHARE_PERMISSION_INVALID(
            2408, "Cấp quyền phải là 1 (xem), 2 (góp ý) hoặc 3 (chỉnh sửa)", HttpStatus.BAD_REQUEST),
    REVIEW_RATING_INVALID(2410, "Số sao phải từ 1 đến 5", HttpStatus.BAD_REQUEST),
    REVIEW_COMMENT_INVALID(2411, "Bình luận tối đa 2000 ký tự", HttpStatus.BAD_REQUEST),
    REVIEW_EMPTY(2412, "Nhận xét cần có số sao hoặc bình luận", HttpStatus.BAD_REQUEST),
    REVIEW_NOT_EXISTED(2413, "Nhận xét không tồn tại", HttpStatus.NOT_FOUND),
    // ---- 39xx: Góp ý gắn vào ô nhịp (mục 4.2)
    COMMENT_NOT_EXISTED(3901, "Không tìm thấy góp ý", HttpStatus.NOT_FOUND),
    COMMENT_CONTENT_INVALID(3902, "Nội dung góp ý từ 1 đến 2000 ký tự", HttpStatus.BAD_REQUEST),
    COMMENT_MEASURE_INVALID(
            3903,
            "Ô nhịp phải nằm trong bản nhạc (từ 1 đến số ô) và ô bắt đầu không lớn hơn ô kết thúc; bản chưa có ô nhịp thì chưa góp ý được",
            HttpStatus.BAD_REQUEST),
    COMMENT_WRITE_FORBIDDEN(3904, "Cần quyền góp ý trở lên để góp ý vào bản nhạc này", HttpStatus.FORBIDDEN),
    COMMENT_FORBIDDEN(3905, "Bạn không sửa, xóa hoặc đánh dấu được góp ý này", HttpStatus.FORBIDDEN),
    COMMENT_MENTION_INVALID(
            3906, "Chỉ nhắc được người xem được bản nhạc này (tối đa 20 người)", HttpStatus.BAD_REQUEST),
    COMMENT_ANCHOR_INVALID(3907, "Bè hoặc danh sách nốt đã chọn không hợp lệ", HttpStatus.BAD_REQUEST),
    // ---- 31xx: Đề xuất sửa (mục 4.3)
    SUGGESTION_FIELDS_INVALID(
            3110,
            "Tiêu đề đề xuất từ 1 đến 200 ký tự, mô tả tối đa 2000 ký tự, ghi chú tối đa 500 ký tự",
            HttpStatus.BAD_REQUEST),
    SUGGESTION_EMPTY(3111, "Đề xuất chưa có thay đổi nào so với phiên bản gốc", HttpStatus.BAD_REQUEST),
    SUGGESTION_TOO_MANY_OPEN(
            3112, "Bạn đang có 10 đề xuất chưa xử lý trên bản nhạc này, hãy đợi hoặc rút bớt", HttpStatus.CONFLICT),
    SUGGESTION_OUTDATED(
            3113,
            "Bản chính đã đổi cấu trúc kể từ khi gửi đề xuất nên không áp dụng được; hãy từ chối và nhờ người gửi làm lại",
            HttpStatus.CONFLICT),
    SUGGESTION_NOT_OPEN(3114, "Đề xuất này đã được xử lý hoặc đã bị rút lại", HttpStatus.CONFLICT),
    SUGGESTION_NOT_EXISTED(3115, "Không tìm thấy đề xuất", HttpStatus.NOT_FOUND),
    SUGGESTION_CHANGES_INVALID(3116, "Danh sách ô được chọn không hợp lệ", HttpStatus.BAD_REQUEST),
    SUGGESTION_RATE_LIMITED(
            3117, "Bạn đã gửi quá 30 đề xuất trong 24 giờ qua, hãy thử lại sau", HttpStatus.TOO_MANY_REQUESTS),
    SUGGESTION_APPLIED_VERSION_INVALID(
            3118, "Phiên bản đã lưu không hợp lệ để đánh dấu đề xuất là đã áp dụng", HttpStatus.BAD_REQUEST),
    // ---- 312x: Đồng chỉnh sửa thời gian thực (mục 4.4)
    LIVE_SESSION_FULL(
            3121, "Phiên cộng tác đã đủ 10 người đang sửa; bạn vào xem được nhưng chưa sửa được", HttpStatus.CONFLICT),
    LIVE_SESSION_ACTIVE(
            3122,
            "Bản nhạc đang có người cùng chỉnh sửa trực tiếp; hãy vào chế độ cộng tác để sửa",
            HttpStatus.CONFLICT),
    LIVE_COLLAB_NOT_AVAILABLE(
            3123, "Gói của chủ bản nhạc chưa có tính năng đồng chỉnh sửa thời gian thực", HttpStatus.FORBIDDEN),
    LIVE_OP_INVALID(3124, "Gói thay đổi cộng tác không hợp lệ hoặc quá lớn", HttpStatus.BAD_REQUEST),
    LIVE_RATE_LIMITED(3126, "Bạn gửi thay đổi quá nhanh, hãy chậm lại một chút", HttpStatus.TOO_MANY_REQUESTS),
    LIVE_SAVED_AS_SUGGESTION(
            3127,
            "Bản nhạc vừa có phiên bản mới ngoài phiên cùng sửa; thay đổi chưa lưu của phiên đã được giữ lại thành một đề xuất",
            HttpStatus.CONFLICT),
    LIVE_ACCESS_CHANGED(
            3128, "Quyền của bạn với bản nhạc này vừa thay đổi; trang sẽ tải lại để cập nhật", HttpStatus.FORBIDDEN),
    ;

    int code;
    String message;
    HttpStatusCode httpStatusCode;

    CollabErrorCode(int code, String message, HttpStatusCode httpStatusCode) {
        this.code = code;
        this.message = message;
        this.httpStatusCode = httpStatusCode;
    }
}
