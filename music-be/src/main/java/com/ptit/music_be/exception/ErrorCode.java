package com.ptit.music_be.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.experimental.FieldDefaults;

@Getter
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public enum ErrorCode {
    UNCATEGORIZED_EXCEPTION(9999, "Uncategorized error", HttpStatus.INTERNAL_SERVER_ERROR),
    UNAUTHENTICATED(1001, "Unauthenticated", HttpStatus.UNAUTHORIZED),
    UNAUTHORIZED(1002, "You do not have permission", HttpStatus.FORBIDDEN),
    USER_EXISTED(1003, "User already existed", HttpStatus.BAD_REQUEST),
    USER_NOT_EXISTED(1004, "User not existed", HttpStatus.NOT_FOUND),
    INVALID_CREDENTIALS(1005, "Email hoặc mật khẩu không đúng", HttpStatus.UNAUTHORIZED),
    USERNAME_INVALID(1006, "Username must be at least {min} characters", HttpStatus.BAD_REQUEST),
    PASSWORD_INVALID(1007, "Mật khẩu phải có ít nhất {min} ký tự", HttpStatus.BAD_REQUEST),
    EMPLOYEE_NOT_FOUND(1008, "Employee not found", HttpStatus.NOT_FOUND),
    INVALID_REQUEST(1009, "Invalid request", HttpStatus.BAD_REQUEST),
    TOO_MANY_REQUESTS(1010, "Too many requests. Please try again later.", HttpStatus.TOO_MANY_REQUESTS),
    FULL_NAME_REQUIRED(1011, "Họ tên là bắt buộc", HttpStatus.BAD_REQUEST),
    PASSWORD_SAME_AS_OLD(1012, "Mật khẩu mới phải khác mật khẩu hiện tại", HttpStatus.BAD_REQUEST),
    CANNOT_MODIFY_SELF(1013, "Quản trị viên không thể khóa hoặc hạ quyền chính mình", HttpStatus.BAD_REQUEST),
    ROLE_NOT_EXISTED(1015, "Vai trò không tồn tại", HttpStatus.BAD_REQUEST),
    ACCOUNT_LOCKED(1016, "Tài khoản đã bị khóa", HttpStatus.FORBIDDEN),
    OTP_INVALID(
            1017,
            "Mã OTP không đúng hoặc đã hết hạn. Nếu nhập sai nhiều lần, hãy yêu cầu mã mới.",
            HttpStatus.BAD_REQUEST),
    OTP_REQUEST_TOO_SOON(
            1018, "Bạn vừa yêu cầu mã OTP, vui lòng chờ một lát rồi thử lại", HttpStatus.TOO_MANY_REQUESTS),
    AVATAR_INVALID(1014, "Ảnh đại diện phải là JPG hoặc PNG, tối đa 2MB", HttpStatus.BAD_REQUEST),

    // Score files & OMR (2xxx)
    SCORE_NOT_EXISTED(2001, "Bản nhạc không tồn tại", HttpStatus.NOT_FOUND),
    FILE_NOT_EXISTED(2002, "File không tồn tại", HttpStatus.NOT_FOUND),
    FILE_EMPTY(2003, "File tải lên bị rỗng", HttpStatus.BAD_REQUEST),
    FILE_TYPE_NOT_SUPPORTED(2004, "Chỉ hỗ trợ file PDF, PNG, JPG, JPEG", HttpStatus.BAD_REQUEST),
    FILE_TOO_LARGE(2005, "File tải lên quá lớn", HttpStatus.PAYLOAD_TOO_LARGE),
    INVALID_UPLOAD_COMBINATION(2006, "Chỉ tải lên đúng 1 file PDF hoặc từ 1 đến 20 ảnh", HttpStatus.BAD_REQUEST),
    FILE_STORAGE_ERROR(2007, "Không lưu được file", HttpStatus.INTERNAL_SERVER_ERROR),
    PDF_ENCRYPTED(2008, "PDF bị mã hóa, đặt mật khẩu hoặc không mở được", HttpStatus.BAD_REQUEST),
    PDF_TOO_MANY_PAGES(2009, "PDF phải có từ 1 đến 20 trang", HttpStatus.BAD_REQUEST),
    IMAGE_RESOLUTION_INVALID(
            2010, "Ảnh không đọc được, cạnh ngắn nhỏ hơn 600px hoặc lớn hơn 40 megapixel", HttpStatus.BAD_REQUEST),
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
            2021, "Chỉ hỗ trợ một file .musicxml, .xml, .mxl, .mid hoặc .midi", HttpStatus.BAD_REQUEST),
    SCORE_TITLE_INVALID(2017, "Tiêu đề là bắt buộc và tối đa 255 ký tự", HttpStatus.BAD_REQUEST),
    SCORE_COMPOSER_INVALID(2018, "Tên tác giả tối đa 255 ký tự", HttpStatus.BAD_REQUEST),
    SCORE_NOTES_INVALID(2019, "Ghi chú tối đa 5000 ký tự", HttpStatus.BAD_REQUEST),
    INVALID_FILTER(2020, "Giá trị bộ lọc không hợp lệ", HttpStatus.BAD_REQUEST),
    SCORE_NOT_PUBLIC_FOR_OFFICIAL(2022, "Chỉ đưa vào kho bản nhạc mẫu được bản nhạc đã công khai", HttpStatus.CONFLICT),
    SCORE_OFFICIAL_LOCKED(2023, "Bản nhạc trong kho bản nhạc mẫu chỉ ADMIN được xóa", HttpStatus.FORBIDDEN),
    SCORE_NOT_PENDING_PUBLIC(2021, "Bản nhạc này không ở trạng thái chờ duyệt công khai", HttpStatus.CONFLICT),
    SCORE_NOT_PUBLIC(2024, "Bản nhạc này chưa được công khai nên không thể gỡ", HttpStatus.CONFLICT),
    SCORE_BUSY(2201, "Bản nhạc đang được xử lý, vui lòng thử lại sau", HttpStatus.CONFLICT),
    TASK_LIMIT_EXCEEDED(
            2202,
            "Bạn đang có 3 tác vụ OMR chờ hoặc đang chạy, hãy đợi một tác vụ hoàn tất",
            HttpStatus.TOO_MANY_REQUESTS),

    // AI tasks (21xx)
    AI_TASK_NOT_EXISTED(2101, "Tác vụ AI không tồn tại", HttpStatus.NOT_FOUND),
    AI_TASK_NOT_CANCELLABLE(2102, "Tác vụ đã kết thúc nên không thể hủy", HttpStatus.CONFLICT),
    AI_TASK_NOT_RETRYABLE(2104, "Chỉ chạy lại được tác vụ số hóa (OMR) đã lỗi hoặc bị hủy", HttpStatus.CONFLICT),
    AI_SERVICE_UNAVAILABLE(2103, "Dịch vụ nhận diện nhạc tạm thời không khả dụng", HttpStatus.SERVICE_UNAVAILABLE),

    // Tags (23xx)
    TAG_NOT_EXISTED(2301, "Thể loại không tồn tại", HttpStatus.NOT_FOUND),
    TAG_NAME_INVALID(2303, "Tên thể loại là bắt buộc và tối đa 50 ký tự", HttpStatus.BAD_REQUEST),
    TAG_DUPLICATED(2304, "Thể loại này đã tồn tại", HttpStatus.CONFLICT),
    TOO_MANY_TAGS(2302, "Mỗi bản nhạc tối đa 10 thể loại", HttpStatus.BAD_REQUEST),

    // Sharing & reviews (24xx)
    ACCESS_REQUEST_NOT_EXISTED(2402, "Không có yêu cầu xin quyền nào đang chờ", HttpStatus.NOT_FOUND),
    ALREADY_HAS_ACCESS(
            2404,
            "Bạn đã có quyền này hoặc cao hơn với bản nhạc (bản nhạc công khai thì ai cũng xem và nhận xét được)",
            HttpStatus.BAD_REQUEST),
    CANNOT_SHARE_WITH_OWNER(2406, "Không thể chia sẻ bản nhạc cho chính chủ sở hữu", HttpStatus.BAD_REQUEST),
    SHARE_MEMBER_NOT_EXISTED(2407, "Người này chưa có quyền với bản nhạc", HttpStatus.NOT_FOUND),
    SHARE_PERMISSION_INVALID(
            2408, "Cấp quyền phải là 1 (xem), 2 (nhận xét) hoặc 3 (chỉnh sửa)", HttpStatus.BAD_REQUEST),
    REVIEW_RATING_INVALID(2410, "Số sao phải từ 1 đến 5", HttpStatus.BAD_REQUEST),
    REVIEW_COMMENT_INVALID(2411, "Bình luận tối đa 2000 ký tự", HttpStatus.BAD_REQUEST),
    REVIEW_EMPTY(2412, "Nhận xét cần có số sao hoặc bình luận", HttpStatus.BAD_REQUEST),
    REVIEW_NOT_EXISTED(2413, "Nhận xét không tồn tại", HttpStatus.NOT_FOUND),
    // Playlists (26xx)
    PLAYLIST_NOT_EXISTED(2601, "Playlist không tồn tại", HttpStatus.NOT_FOUND),
    PLAYLIST_NAME_INVALID(2602, "Tên playlist là bắt buộc và tối đa 255 ký tự", HttpStatus.BAD_REQUEST),
    PLAYLIST_DESCRIPTION_INVALID(2603, "Mô tả playlist tối đa 2000 ký tự", HttpStatus.BAD_REQUEST),
    PLAYLIST_SCORE_DUPLICATED(2604, "Bản nhạc đã có trong playlist", HttpStatus.CONFLICT),
    PLAYLIST_SCORE_NOT_IN_PLAYLIST(2605, "Bản nhạc không có trong playlist", HttpStatus.NOT_FOUND),
    PLAYLIST_ORDER_INVALID(2606, "Danh sách thứ tự không khớp với các bài trong playlist", HttpStatus.BAD_REQUEST),
    NOTIFICATION_NOT_EXISTED(2501, "Thông báo không tồn tại", HttpStatus.NOT_FOUND),

    // Export 27xx
    EXPORT_OPTION_INVALID(2701, "Tùy chọn xuất file không hợp lệ", HttpStatus.BAD_REQUEST),
    AUDIO_TOO_LONG(2702, "Bản nhạc quá dài để xuất âm thanh (tối đa 20 phút), hãy tăng tempo", HttpStatus.BAD_REQUEST),
    EXPORT_LIMIT_EXCEEDED(
            2703,
            "Bạn đang xuất quá nhiều file, vui lòng đợi các tác vụ xuất đang chạy hoàn tất",
            HttpStatus.TOO_MANY_REQUESTS),
    EXPORT_NOT_AVAILABLE(2704, "Tính năng xuất file chưa sẵn sàng trên máy chủ", HttpStatus.SERVICE_UNAVAILABLE),
    EXPORT_SOURCE_NOT_SUPPORTED(2705, "Bản nhạc không có nguồn phù hợp để chuyển đổi", HttpStatus.CONFLICT),

    // Practice sessions 30xx
    PRACTICE_SESSION_NOT_EXISTED(3001, "Phiên tập không tồn tại", HttpStatus.NOT_FOUND),
    PRACTICE_SESSION_INVALID(3002, "Dữ liệu phiên tập không hợp lệ", HttpStatus.BAD_REQUEST),
    PRACTICE_STATS_DAYS_INVALID(3005, "Số ngày thống kê phải từ 7 đến 90", HttpStatus.BAD_REQUEST),
    PRACTICE_STATS_PERIOD_INVALID(3004, "Chu kỳ thống kê phải là DAY, WEEK hoặc MONTH", HttpStatus.BAD_REQUEST),
    PRACTICE_STATS_RANGE_INVALID(3003, "Khoảng ngày thống kê không hợp lệ (tối đa 400 ngày)", HttpStatus.BAD_REQUEST),

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
    COMPOSER_NOT_EXISTED(3501, "Nhạc sĩ không tồn tại", HttpStatus.NOT_FOUND),
    COMPOSER_NAME_INVALID(3502, "Tên nhạc sĩ là bắt buộc và tối đa 255 ký tự", HttpStatus.BAD_REQUEST),
    COMPOSER_DUPLICATED(3503, "Đã có nhạc sĩ trùng tên (đường dẫn)", HttpStatus.CONFLICT),
    COMPOSER_YEARS_INVALID(3504, "Năm sinh, năm mất không hợp lệ", HttpStatus.BAD_REQUEST),
    COMPOSER_IMAGE_INVALID(3505, "Ảnh phải là đường dẫn https và có ghi nguồn, giấy phép", HttpStatus.BAD_REQUEST),
    COMPOSER_FIELD_TOO_LONG(3506, "Thông tin nhạc sĩ vượt quá độ dài cho phép", HttpStatus.BAD_REQUEST),

    // Gói dịch vụ và thanh toán 37xx
    PLAN_NOT_EXISTED(3701, "Gói dịch vụ không tồn tại", HttpStatus.NOT_FOUND),
    PLAN_LIMIT_REACHED(3702, "Bạn đã dùng hết hạn mức của gói hiện tại", HttpStatus.PAYMENT_REQUIRED),
    SUBSCRIPTION_MONTHS_INVALID(3703, "Số tháng cấp gói phải từ 1 đến 120", HttpStatus.BAD_REQUEST),
    PAYMENT_PROVIDER_UNAVAILABLE(3711, "Cổng thanh toán chưa được cấu hình", HttpStatus.SERVICE_UNAVAILABLE),
    PAYMENT_PLAN_NOT_PURCHASABLE(3712, "Gói này không thể mua", HttpStatus.BAD_REQUEST),
    PAYMENT_ORDER_NOT_EXISTED(3713, "Đơn thanh toán không tồn tại", HttpStatus.NOT_FOUND),
    PAYMENT_ORDER_NOT_REFUNDABLE(3714, "Chỉ hoàn tiền được đơn đã thanh toán", HttpStatus.CONFLICT),
    PAYMENT_PERIOD_INVALID(3715, "Chu kỳ thanh toán phải là MONTH hoặc YEAR", HttpStatus.BAD_REQUEST),
    PAYMENT_RANGE_INVALID(3716, "Khoảng ngày doanh thu không hợp lệ (tối đa 366 ngày)", HttpStatus.BAD_REQUEST),
    PAYMENT_ORDER_NOT_PAYABLE(3717, "Đơn này không còn chờ thanh toán", HttpStatus.CONFLICT),
    PAYMENT_NOT_NEEDED(3718, "Tài khoản quản trị đã có quyền lợi của gói này, không cần mua", HttpStatus.CONFLICT),
    PLAN_PRICE_INVALID(3719, "Giá không hợp lệ: gói Free phải là 0, gói trả phí từ 1 đến 1.000.000.000 đồng", HttpStatus.BAD_REQUEST),
    PLAN_NAME_INVALID(3720, "Tên gói không được trống và tối đa 100 ký tự", HttpStatus.BAD_REQUEST),
    PLAN_LIMITS_INVALID(3721, "Hạn mức không hợp lệ: mỗi số từ 0 đến 10.000.000 (để trống = không giới hạn), task cùng lúc ít nhất 1", HttpStatus.BAD_REQUEST),
    PLAN_CODE_INVALID(3722, "Mã gói gồm 2-16 ký tự: chữ in hoa, số, dấu gạch dưới", HttpStatus.BAD_REQUEST),
    PLAN_CODE_EXISTED(3723, "Mã gói đã tồn tại", HttpStatus.CONFLICT),
    PLAN_AUDIENCE_INVALID(3724, "Nhóm gói phải là Cá nhân (PERSONAL) hoặc Team (TEAM)", HttpStatus.BAD_REQUEST),
    PLAN_SYSTEM_LOCKED(3725, "Không xóa được gói Free và Pro (hệ thống dùng cho người dùng mới và quản trị viên)", HttpStatus.CONFLICT),
    PLAN_NOT_GRANTABLE(3727, "Hiện chỉ cấp được gói cá nhân; cấp gói team sẽ có khi làm tính năng Team", HttpStatus.BAD_REQUEST),
    ROLE_PLAN_NOT_APPLICABLE(3728, "Chỉ tạm ngưng hoặc mở lại gói Pro theo vai trò cho tài khoản ADMIN (không phải SUPER_ADMIN)", HttpStatus.BAD_REQUEST),
    ROLE_PLAN_SUSPENSION_INVALID(3729, "Thời hạn tạm ngưng phải từ hết tháng này đến 120 tháng, lý do tối đa 255 ký tự", HttpStatus.BAD_REQUEST),
    PLAN_IN_USE(3726, "Gói đã có người đăng ký hoặc có đơn thanh toán nên không xóa được", HttpStatus.CONFLICT),
    ;

    int code;
    String message;
    HttpStatusCode httpStatusCode;

    ErrorCode(int code, String message, HttpStatusCode httpStatusCode) {
        this.code = code;
        this.message = message;
        this.httpStatusCode = httpStatusCode;
    }
}
