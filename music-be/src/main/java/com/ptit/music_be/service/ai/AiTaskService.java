package com.ptit.music_be.service.ai;

import java.util.List;

import com.ptit.music_be.dto.response.ai.AiTaskResponse;

public interface AiTaskService {

    AiTaskResponse getTask(String taskId);

    List<AiTaskResponse> getTasksOfScore(String scoreId);

    /**
     * Hủy một tác vụ (đặc tả mục 2.2 luồng 4). Chỉ chủ task hoặc ADMIN; chỉ khi task đang PENDING/PROCESSING, ngược
     * lại ném AI_TASK_NOT_CANCELLABLE (2102). Task chuyển CANCELLED với error_message = CANCELLED_BY_USER, Score
     * (nếu là task OMR) chuyển FAILED, rồi báo music-ai dừng job (lỗi khi báo chỉ ghi log).
     */
    AiTaskResponse cancelTask(String taskId);
}
