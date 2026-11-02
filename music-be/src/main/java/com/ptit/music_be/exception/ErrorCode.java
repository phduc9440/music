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

    // Score files & OMR (2xxx)
    SCORE_NOT_EXISTED(2001, "Score not existed", HttpStatus.NOT_FOUND),
    FILE_NOT_EXISTED(2002, "File not existed", HttpStatus.NOT_FOUND),
    FILE_EMPTY(2003, "Uploaded file is empty", HttpStatus.BAD_REQUEST),
    FILE_TYPE_NOT_SUPPORTED(2004, "Only PDF, PNG, JPG, JPEG files are supported", HttpStatus.BAD_REQUEST),
    FILE_TOO_LARGE(2005, "Uploaded file is too large", HttpStatus.PAYLOAD_TOO_LARGE),
    INVALID_UPLOAD_COMBINATION(
            2006, "Upload either exactly one PDF file or between 1 and 20 image files", HttpStatus.BAD_REQUEST),
    FILE_STORAGE_ERROR(2007, "Could not store file", HttpStatus.INTERNAL_SERVER_ERROR),

    // AI tasks (21xx)
    AI_TASK_NOT_EXISTED(2101, "AI task not existed", HttpStatus.NOT_FOUND),
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
