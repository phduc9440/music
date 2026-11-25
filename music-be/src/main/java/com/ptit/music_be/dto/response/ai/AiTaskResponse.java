package com.ptit.music_be.dto.response.ai;

import java.time.LocalDateTime;

import com.fasterxml.jackson.annotation.JsonRawValue;
import com.ptit.music_be.dto.enums.ai.AiTaskStatus;
import com.ptit.music_be.dto.enums.ai.AiTaskType;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class AiTaskResponse {
    String id;
    String scoreId;
    AiTaskType taskType;
    AiTaskStatus status;
    Integer progress;
    /** Bước đang chạy (SPLIT_PDF, PREPROCESS, ...), có thể null. */
    String step;

    String errorMessage;

    @JsonRawValue
    String resultData;

    LocalDateTime createdAt;
    LocalDateTime startedAt;
    LocalDateTime finishedAt;

    /** Hàng đợi của task OMR còn chờ (OMR-10); null với task khác. */
    Queue queue;

    /** Vị trí trong hàng đợi OMR và thời gian chờ ước lượng. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class Queue {
        /** Thứ tự trong hàng, 1 = chạy ngay sau khi music-ai rảnh. */
        Integer position;

        /** Số trang của các task đứng trước (kể cả phần còn lại của task đang chạy). */
        Integer pagesAhead;

        /** Thời gian chờ tới lượt (giây, ước lượng). */
        Long waitSeconds;

        /** Thời gian tới khi xong cả task này (giây, ước lượng). */
        Long etaSeconds;

        /** music-ai đang đầy hàng (503): Java giữ task và tự gửi lại, không phải lỗi. */
        Boolean busy;
    }
}
