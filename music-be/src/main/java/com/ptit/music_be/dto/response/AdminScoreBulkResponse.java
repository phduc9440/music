package com.ptit.music_be.dto.response;

import java.util.List;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Kết quả thao tác hàng loạt: từng bản được xử lý độc lập, bản lỗi không chặn các bản còn lại. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class AdminScoreBulkResponse {
    int success;
    List<Failure> failures;

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class Failure {
        String id;
        String message;
    }
}
