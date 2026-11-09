package com.ptit.music_be.dto.response;

import java.time.Instant;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Một bản ghi log lỗi (mức ERROR) gần đây. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ErrorLogResponse {
    long id;
    Instant timestamp;
    String level;
    String logger;
    String thread;
    String message;
    /** Tên class exception, null nếu log không kèm exception. */
    String exceptionClass;
    String stackTrace;
}
