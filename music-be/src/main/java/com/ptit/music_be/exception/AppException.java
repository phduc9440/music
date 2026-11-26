package com.ptit.music_be.exception;

public class AppException extends RuntimeException {
    private ErrorCode errorCode;

    /** Dữ liệu kèm theo lỗi, được trả trong {@code ApiResponse.result} (ví dụ version mới nhất khi bị xung đột). */
    private final transient Object payload;

    public AppException(ErrorCode errorCode) {
        this(errorCode, null);
    }

    public AppException(ErrorCode errorCode, Object payload) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
        this.payload = payload;
    }

    public ErrorCode getErrorCode() {
        return errorCode;
    }

    public void setErrorCode(ErrorCode errorCode) {
        this.errorCode = errorCode;
    }

    public Object getPayload() {
        return payload;
    }
}
