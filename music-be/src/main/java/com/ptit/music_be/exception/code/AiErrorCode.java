package com.ptit.music_be.exception.code;

import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;

import com.ptit.music_be.exception.ErrorCode;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.experimental.FieldDefaults;

/** Tác vụ AI và gợi ý hợp âm (21xx, 313x). */
@Getter
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public enum AiErrorCode implements ErrorCode {
    // AI tasks (21xx)
    AI_TASK_NOT_EXISTED(2101, "Tác vụ AI không tồn tại", HttpStatus.NOT_FOUND),
    AI_TASK_NOT_CANCELLABLE(2102, "Tác vụ đã kết thúc nên không thể hủy", HttpStatus.CONFLICT),
    AI_TASK_NOT_RETRYABLE(2104, "Chỉ chạy lại được tác vụ số hóa (OMR) đã lỗi hoặc bị hủy", HttpStatus.CONFLICT),
    AI_SERVICE_UNAVAILABLE(2103, "Dịch vụ nhận diện nhạc tạm thời không khả dụng", HttpStatus.SERVICE_UNAVAILABLE),
    // ---- 3130-3134: Gợi ý hợp âm tự động (R3)
    CHORD_STYLE_INVALID(3130, "Phong cách hợp âm phải là POP, BALLAD hoặc JAZZ", HttpStatus.BAD_REQUEST),
    CHORD_TASK_RUNNING(3131, "Bản nhạc đang được gợi ý hợp âm, vui lòng chờ xong", HttpStatus.CONFLICT),
    CHORD_SUGGESTION_PENDING(
            3132, "Bản nhạc đã có một gợi ý hợp âm đang chờ duyệt; hãy nhận hoặc từ chối trước", HttpStatus.CONFLICT),
    CHORD_NO_MELODY(3133, "Bản nhạc không có giai điệu để gợi ý hợp âm", HttpStatus.BAD_REQUEST),
    CHORD_ALREADY_HARMONIZED(3134, "Mọi ô nhịp của bản nhạc đã có hợp âm", HttpStatus.BAD_REQUEST),
    ;

    int code;
    String message;
    HttpStatusCode httpStatusCode;

    AiErrorCode(int code, String message, HttpStatusCode httpStatusCode) {
        this.code = code;
        this.message = message;
        this.httpStatusCode = httpStatusCode;
    }
}
