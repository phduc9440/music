package com.ptit.music_be.controller.ai;

import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ptit.music_be.dto.request.AiTaskCompleteRequest;
import com.ptit.music_be.dto.request.AiTaskFailRequest;
import com.ptit.music_be.dto.request.AiTaskFileRequest;
import com.ptit.music_be.dto.request.AiTaskProgressRequest;
import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.service.ai.InternalAiTaskService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

/**
 * Callback nội bộ để music-ai báo tiến độ và kết quả (đặc tả mục 6.3). Không dùng JWT: được bảo vệ bằng header
 * X-Internal-Key và chỉ nhận từ localhost/mạng nội bộ (xem InternalSecurityConfig). Không dành cho web.
 */
@RestController
@RequestMapping("/internal/ai-tasks/{taskId}")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Internal callbacks", description = "Chỉ music-ai gọi; cần header X-Internal-Key, không dùng JWT")
public class InternalCallbackController {

    static final String KEY_DESCRIPTION = "Khóa bí mật dùng chung với music-ai (biến môi trường AI_INTERNAL_KEY)";

    InternalAiTaskService internalAiTaskService;

    @PostMapping("/progress")
    @Operation(
            summary = "music-ai báo tiến độ (task PENDING chuyển PROCESSING)",
            description = "401 sai X-Internal-Key; 403 không phải mạng nội bộ; 2101 task không tồn tại; 1009 progress"
                    + " ngoài 0-100, nhỏ hơn tiến độ đã ghi hoặc step không hợp lệ. Task đã kết thúc: bỏ qua, trả 200.",
            parameters =
                    @Parameter(
                            name = "X-Internal-Key",
                            in = ParameterIn.HEADER,
                            required = true,
                            description = KEY_DESCRIPTION))
    public ApiResponse<Void> progress(@PathVariable String taskId, @Valid @RequestBody AiTaskProgressRequest request) {
        internalAiTaskService.updateProgress(taskId, request);
        return ApiResponse.<Void>builder().build();
    }

    @PostMapping("/files")
    @Operation(
            summary = "music-ai báo đã ghi xong một file kết quả (ví dụ PNG trang đã tiền xử lý)",
            description = "401 sai X-Internal-Key; 2101 task không tồn tại; 1009 fileType không hợp lệ hoặc storagePath"
                    + " không nằm trong scores/{scoreId}/; 2002 file chưa có trên đĩa. Task đã kết thúc: trả 200.",
            parameters =
                    @Parameter(
                            name = "X-Internal-Key",
                            in = ParameterIn.HEADER,
                            required = true,
                            description = KEY_DESCRIPTION))
    public ApiResponse<Void> file(@PathVariable String taskId, @Valid @RequestBody AiTaskFileRequest request) {
        internalAiTaskService.addFile(taskId, request);
        return ApiResponse.<Void>builder().build();
    }

    @PostMapping("/complete")
    @Operation(
            summary = "music-ai báo hoàn tất: task COMPLETED, ghi result_data và metadata của score",
            description = "401 sai X-Internal-Key; 2101 task không tồn tại. Task đã kết thúc: bỏ qua, trả 200.",
            parameters =
                    @Parameter(
                            name = "X-Internal-Key",
                            in = ParameterIn.HEADER,
                            required = true,
                            description = KEY_DESCRIPTION))
    public ApiResponse<Void> complete(@PathVariable String taskId, @RequestBody AiTaskCompleteRequest request) {
        internalAiTaskService.complete(taskId, request);
        return ApiResponse.<Void>builder().build();
    }

    @PostMapping("/fail")
    @Operation(
            summary = "music-ai báo lỗi: task FAILED, score FAILED, error_message = 'MÃ: message'",
            description = "401 sai X-Internal-Key; 2101 task không tồn tại. Task đã kết thúc: bỏ qua, trả 200.",
            parameters =
                    @Parameter(
                            name = "X-Internal-Key",
                            in = ParameterIn.HEADER,
                            required = true,
                            description = KEY_DESCRIPTION))
    public ApiResponse<Void> fail(@PathVariable String taskId, @Valid @RequestBody AiTaskFailRequest request) {
        internalAiTaskService.fail(taskId, request.getErrorCode(), request.getMessage());
        return ApiResponse.<Void>builder().build();
    }
}
