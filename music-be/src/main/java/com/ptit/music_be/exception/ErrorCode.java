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
    INVALID_CREDENTIALS(1005, "Invalid username or password", HttpStatus.UNAUTHORIZED),
    USERNAME_INVALID(1006, "Username must be at least {min} characters", HttpStatus.BAD_REQUEST),
    PASSWORD_INVALID(1007, "Password must be at least {min} characters", HttpStatus.BAD_REQUEST),
    EMPLOYEE_NOT_FOUND(1008, "Employee not found", HttpStatus.NOT_FOUND),
    INVALID_REQUEST(1009, "Invalid request", HttpStatus.BAD_REQUEST),

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

    SCORE_TITLE_INVALID(2017, "Tiêu đề là bắt buộc và tối đa 255 ký tự", HttpStatus.BAD_REQUEST),
    SCORE_COMPOSER_INVALID(2018, "Tên tác giả tối đa 255 ký tự", HttpStatus.BAD_REQUEST),
    SCORE_NOTES_INVALID(2019, "Ghi chú tối đa 5000 ký tự", HttpStatus.BAD_REQUEST),
    INVALID_FILTER(2020, "Giá trị bộ lọc không hợp lệ", HttpStatus.BAD_REQUEST),
    SCORE_BUSY(2201, "Bản nhạc đang được xử lý, vui lòng thử lại sau", HttpStatus.CONFLICT),
    TASK_LIMIT_EXCEEDED(
            2202,
            "Bạn đang có 3 tác vụ OMR chờ hoặc đang chạy, hãy đợi một tác vụ hoàn tất",
            HttpStatus.TOO_MANY_REQUESTS),

    // AI tasks (21xx)
    AI_TASK_NOT_EXISTED(2101, "Tác vụ AI không tồn tại", HttpStatus.NOT_FOUND),
    AI_TASK_NOT_CANCELLABLE(2102, "Tác vụ đã kết thúc nên không thể hủy", HttpStatus.CONFLICT),
    AI_SERVICE_UNAVAILABLE(2103, "Dịch vụ nhận diện nhạc tạm thời không khả dụng", HttpStatus.SERVICE_UNAVAILABLE),
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
