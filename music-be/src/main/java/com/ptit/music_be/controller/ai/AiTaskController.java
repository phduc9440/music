package com.ptit.music_be.controller.ai;

import java.util.List;

import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.response.ai.AiTaskResponse;
import com.ptit.music_be.dto.response.common.ApiResponse;
import com.ptit.music_be.service.ai.AiTaskService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "AI tasks", description = "Status of background AI / conversion tasks")
public class AiTaskController {

    AiTaskService aiTaskService;

    @GetMapping("/ai-tasks/{taskId}")
    @Operation(summary = "Get status of an AI task", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<AiTaskResponse> getTask(@PathVariable String taskId) {
        return ApiResponse.<AiTaskResponse>builder()
                .result(aiTaskService.getTask(taskId))
                .build();
    }

    @PostMapping("/ai-tasks/{taskId}/cancel")
    @Operation(
            summary = "Hủy một tác vụ đang chờ hoặc đang chạy (task CANCELLED, score FAILED)",
            description = "Chỉ chủ task hoặc ADMIN. Errors: 2101 task không tồn tại, 1002 không có quyền,"
                    + " 2102 task đã kết thúc nên không hủy được",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<AiTaskResponse> cancelTask(@PathVariable String taskId) {
        return ApiResponse.<AiTaskResponse>builder()
                .result(aiTaskService.cancelTask(taskId))
                .build();
    }

    @GetMapping("/scores/{scoreId}/ai-tasks")
    @Operation(summary = "List AI tasks of a score", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<AiTaskResponse>> getTasksOfScore(@PathVariable String scoreId) {
        return ApiResponse.<List<AiTaskResponse>>builder()
                .result(aiTaskService.getTasksOfScore(scoreId))
                .build();
    }
}
