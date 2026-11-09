package com.ptit.music_be.dto.response;

import java.time.LocalDateTime;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonRawValue;
import com.ptit.music_be.dto.enums.AiTaskStatus;
import com.ptit.music_be.dto.enums.AiTaskType;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Một tác vụ AI trong trang giám sát của admin. inputData/resultData chỉ có ở API chi tiết. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AdminAiTaskResponse {
    String id;
    AiTaskType taskType;
    AiTaskStatus status;
    String step;
    Integer progress;
    String errorMessage;
    Integer retryCount;

    String scoreId;
    String scoreTitle;
    String memberEmail;

    LocalDateTime createdAt;
    LocalDateTime startedAt;
    LocalDateTime finishedAt;
    /** Giây chờ từ lúc tạo đến lúc bắt đầu (đến hiện tại nếu chưa bắt đầu). */
    Long waitSeconds;
    /** Giây chạy từ lúc bắt đầu đến lúc xong (đến hiện tại nếu đang chạy); null nếu chưa bắt đầu. */
    Long runSeconds;

    boolean canCancel;
    /** Chỉ task OMR đã lỗi hoặc bị hủy, và bản nhạc không có task OMR khác đang chạy. */
    boolean canRetry;

    @JsonRawValue
    String inputData;

    @JsonRawValue
    String resultData;

    /** Số liệu tóm tắt cho đầu trang giám sát. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class Summary {
        long pending;
        long processing;
        long failedLast24h;
        long completedLast24h;
        /** Thời gian chạy trung bình (giây) của các task xong trong 7 ngày, theo loại. */
        List<TypeAverage> averageRunSeconds;
    }

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class TypeAverage {
        AiTaskType taskType;
        double seconds;
        long count;
    }
}
