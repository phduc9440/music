package com.ptit.music_be.dto.request;

import java.util.Map;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;

/** Body của {@code POST /internal/ai-tasks/{taskId}/complete} (đặc tả mục 6.3). */
@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class AiTaskCompleteRequest {

    /** Ghi nguyên vào ai_tasks.result_data, ví dụ {"pageCount":3,"warnings":["Trang 4 không có khuông nhạc"]}. */
    Map<String, Object> resultData;

    /** Thông tin cập nhật vào bảng scores; trường nào null thì giữ nguyên. */
    ScoreMetadata scoreMetadata;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class ScoreMetadata {
        Integer measureCount;
        String keySignature;
        String timeSignature;
        Integer tempoBpm;
        Integer staffCount;
        Integer pageCount;
    }
}
