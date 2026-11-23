package com.ptit.music_be.exception.code;

import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;

import com.ptit.music_be.exception.ErrorCode;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.experimental.FieldDefaults;

/** Tài khoản, vai trò, thành viên (1xxx). */
@Getter
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public enum AccountErrorCode implements ErrorCode {
    UNCATEGORIZED_EXCEPTION(9999, "Uncategorized error", HttpStatus.INTERNAL_SERVER_ERROR),
    UNAUTHENTICATED(1001, "Unauthenticated", HttpStatus.UNAUTHORIZED),
    UNAUTHORIZED(1002, "You do not have permission", HttpStatus.FORBIDDEN),
    USER_EXISTED(1003, "User already existed", HttpStatus.BAD_REQUEST),
    USER_NOT_EXISTED(1004, "User not existed", HttpStatus.NOT_FOUND),
    INVALID_CREDENTIALS(1005, "Email hoặc mật khẩu không đúng", HttpStatus.UNAUTHORIZED),
    USERNAME_INVALID(1006, "Vui lòng nhập email", HttpStatus.BAD_REQUEST),
    PASSWORD_INVALID(1007, "Mật khẩu phải có ít nhất {min} ký tự", HttpStatus.BAD_REQUEST),
    EMPLOYEE_NOT_FOUND(1008, "Employee not found", HttpStatus.NOT_FOUND),
    INVALID_REQUEST(1009, "Invalid request", HttpStatus.BAD_REQUEST),
    TOO_MANY_REQUESTS(1010, "Too many requests. Please try again later.", HttpStatus.TOO_MANY_REQUESTS),
    FULL_NAME_REQUIRED(1011, "Họ tên là bắt buộc", HttpStatus.BAD_REQUEST),
    PASSWORD_SAME_AS_OLD(1012, "Mật khẩu mới phải khác mật khẩu hiện tại", HttpStatus.BAD_REQUEST),
    CANNOT_MODIFY_SELF(1013, "Quản trị viên không thể khóa hoặc hạ quyền chính mình", HttpStatus.BAD_REQUEST),
    ROLE_NOT_EXISTED(1015, "Vai trò không tồn tại", HttpStatus.BAD_REQUEST),
    ROLE_BUILT_IN(
            1020,
            "Vai trò có sẵn: không đổi tên, không xóa; USER và SUPER_ADMIN cũng không chỉnh quyền",
            HttpStatus.BAD_REQUEST),
    ROLE_IN_USE(1021, "Vai trò đang được gán cho thành viên, hãy gỡ khỏi họ trước khi xóa", HttpStatus.CONFLICT),
    ROLE_LABEL_INVALID(1022, "Tên vai trò từ 2 đến 100 ký tự, mô tả tối đa 255 ký tự", HttpStatus.BAD_REQUEST),
    ROLE_LABEL_DUPLICATED(1023, "Đã có vai trò trùng tên này", HttpStatus.CONFLICT),
    ROLE_ASSIGN_FORBIDDEN(1025, "Bạn không được gán vai trò này", HttpStatus.FORBIDDEN),
    MEMBER_EMAIL_INVALID(1026, "Email không hợp lệ", HttpStatus.BAD_REQUEST),
    STATUS_REASON_INVALID(1024, "Lý do khóa / mở khóa tối đa 255 ký tự", HttpStatus.BAD_REQUEST),
    ACCOUNT_LOCKED(1016, "Tài khoản đã bị khóa", HttpStatus.FORBIDDEN),
    OTP_INVALID(
            1017,
            "Mã OTP không đúng hoặc đã hết hạn. Nếu nhập sai nhiều lần, hãy yêu cầu mã mới.",
            HttpStatus.BAD_REQUEST),
    OTP_REQUEST_TOO_SOON(
            1018, "Bạn vừa yêu cầu mã OTP, vui lòng chờ một lát rồi thử lại", HttpStatus.TOO_MANY_REQUESTS),
    RESET_SESSION_INVALID(
            1019,
            "Phiên đặt lại mật khẩu đã hết hạn hoặc không hợp lệ, vui lòng yêu cầu mã OTP mới",
            HttpStatus.BAD_REQUEST),
    AVATAR_INVALID(1014, "Ảnh đại diện phải là JPG hoặc PNG, tối đa 2MB", HttpStatus.BAD_REQUEST),
    ;

    int code;
    String message;
    HttpStatusCode httpStatusCode;

    AccountErrorCode(int code, String message, HttpStatusCode httpStatusCode) {
        this.code = code;
        this.message = message;
        this.httpStatusCode = httpStatusCode;
    }
}
