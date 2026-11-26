package com.ptit.music_be.exception;

import java.util.Map;
import java.util.Objects;

import jakarta.validation.ConstraintViolation;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import com.ptit.music_be.dto.response.common.ApiResponse;
import com.ptit.music_be.exception.code.AccountErrorCode;
import com.ptit.music_be.exception.code.ScoreErrorCode;

@ControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private static final String MIN_ATTRIBUTE = "min";

    @ExceptionHandler(value = Exception.class)
    ResponseEntity<ApiResponse> handlingRuntimeException(Exception exception) {
        // Lỗi không lường trước (HTTP 500): ghi log ERROR để admin xem được ở trang giám sát (mục 4.8)
        log.error("Unhandled exception", exception);
        ApiResponse apiResponse = new ApiResponse();

        apiResponse.setCode(AccountErrorCode.UNCATEGORIZED_EXCEPTION.getCode());
        apiResponse.setMessage(AccountErrorCode.UNCATEGORIZED_EXCEPTION.getMessage());

        return ResponseEntity.status(AccountErrorCode.UNCATEGORIZED_EXCEPTION.getHttpStatusCode())
                .body(apiResponse);
    }

    /** Đường dẫn không có handler (gõ sai /api/...): 404, ghi WARN thay vì ERROR để trang Hệ thống không đếm là lỗi. */
    @ExceptionHandler(value = {NoResourceFoundException.class, NoHandlerFoundException.class})
    ResponseEntity<ApiResponse> handlingNotFound(Exception exception) {
        log.warn("Không có đường dẫn: {}", exception.getMessage());
        ApiResponse apiResponse = new ApiResponse();
        apiResponse.setCode(AccountErrorCode.API_NOT_FOUND.getCode());
        apiResponse.setMessage(AccountErrorCode.API_NOT_FOUND.getMessage());
        return ResponseEntity.status(AccountErrorCode.API_NOT_FOUND.getHttpStatusCode())
                .body(apiResponse);
    }

    @ExceptionHandler(value = AppException.class)
    ResponseEntity<ApiResponse> handlingAppException(AppException exception) {
        ErrorCode errorCode = exception.getErrorCode();
        ApiResponse apiResponse = new ApiResponse();

        apiResponse.setCode(errorCode.getCode());
        apiResponse.setMessage(errorCode.getMessage());
        // Một số lỗi kèm dữ liệu cho client (ví dụ SCORE_VERSION_CONFLICT trả version mới nhất)
        apiResponse.setResult(exception.getPayload());

        return ResponseEntity.status(errorCode.getHttpStatusCode()).body(apiResponse);
    }

    @ExceptionHandler(value = MaxUploadSizeExceededException.class)
    ResponseEntity<ApiResponse> handlingMaxUploadSize(MaxUploadSizeExceededException exception) {
        ErrorCode errorCode = ScoreErrorCode.FILE_TOO_LARGE;

        return ResponseEntity.status(errorCode.getHttpStatusCode())
                .body(ApiResponse.builder()
                        .code(errorCode.getCode())
                        .message(errorCode.getMessage())
                        .build());
    }

    /** Body JSON hỏng hoặc giá trị enum không hợp lệ (ví dụ visibility = "ABC"), hoặc tham số query sai kiểu. */
    @ExceptionHandler(value = {HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    ResponseEntity<ApiResponse> handlingBadRequest(Exception exception) {
        ErrorCode errorCode = AccountErrorCode.INVALID_REQUEST;

        return ResponseEntity.status(errorCode.getHttpStatusCode())
                .body(ApiResponse.builder()
                        .code(errorCode.getCode())
                        .message(errorCode.getMessage())
                        .build());
    }

    @ExceptionHandler(value = AccessDeniedException.class)
    ResponseEntity<ApiResponse> handlingAccessDeniedException(AccessDeniedException exception) {
        ErrorCode errorCode = AccountErrorCode.UNAUTHORIZED;

        return ResponseEntity.status(errorCode.getHttpStatusCode())
                .body(ApiResponse.builder()
                        .code(errorCode.getCode())
                        .message(errorCode.getMessage())
                        .build());
    }

    @ExceptionHandler(value = MethodArgumentNotValidException.class)
    ResponseEntity<ApiResponse> handlingValidation(MethodArgumentNotValidException exception) {
        String enumKey = exception.getFieldError().getDefaultMessage();
        ErrorCode errorCode = AccountErrorCode.INVALID_REQUEST;
        Map<String, Object> attributes = null;

        try {
            errorCode = ErrorCode.valueOf(enumKey);

            var constraintViolation =
                    exception.getBindingResult().getAllErrors().getFirst().unwrap(ConstraintViolation.class);

            attributes = constraintViolation.getConstraintDescriptor().getAttributes();

        } catch (IllegalArgumentException e) {

        }

        ApiResponse apiResponse = new ApiResponse();

        apiResponse.setCode(errorCode.getCode());
        apiResponse.setMessage(
                Objects.nonNull(attributes)
                        ? mapAttribute(errorCode.getMessage(), attributes)
                        : errorCode.getMessage());

        return ResponseEntity.status(errorCode.getHttpStatusCode()).body(apiResponse);
    }

    /** Điền {min} từ ràng buộc (ví dụ @Size); ràng buộc không có min (như @NotBlank) thì giữ nguyên, không in "null". */
    private String mapAttribute(String message, Map<String, Object> attributes) {
        Object minValue = attributes.get(MIN_ATTRIBUTE);
        if (minValue == null) {
            return message;
        }
        return message.replace("{" + MIN_ATTRIBUTE + "}", String.valueOf(minValue));
    }
}
