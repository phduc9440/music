package com.ptit.music_be.service;

import java.util.List;

import com.ptit.music_be.dto.response.AiTaskResponse;

public interface AiTaskService {

    AiTaskResponse getTask(String taskId);

    List<AiTaskResponse> getTasksOfScore(String scoreId);
}
