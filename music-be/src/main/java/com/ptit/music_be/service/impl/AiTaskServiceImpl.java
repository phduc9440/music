package com.ptit.music_be.service.impl;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.response.AiTaskResponse;
import com.ptit.music_be.entity.AiTask;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.mapper.AiTaskMapper;
import com.ptit.music_be.repository.AiTaskRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.AiTaskService;
import com.ptit.music_be.service.ScoreFileService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class AiTaskServiceImpl implements AiTaskService {

    AiTaskRepository aiTaskRepository;
    ScoreRepository scoreRepository;
    ScoreFileService scoreFileService;
    AiTaskMapper aiTaskMapper;

    @Override
    @Transactional(readOnly = true)
    public AiTaskResponse getTask(String taskId) {
        AiTask task = aiTaskRepository.findById(taskId).orElseThrow(() -> new AppException(ErrorCode.AI_TASK_NOT_EXISTED));
        if (!SecurityUtils.isAdmin()
                && !SecurityUtils.getCurrentEmail().equals(task.getMember().getEmail())) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
        return aiTaskMapper.toResponse(task);
    }

    @Override
    @Transactional(readOnly = true)
    public List<AiTaskResponse> getTasksOfScore(String scoreId) {
        Score score = scoreRepository.findById(scoreId).orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
        scoreFileService.checkCanView(score);
        return aiTaskRepository.findByScoreIdOrderByCreatedAtDesc(scoreId).stream()
                .map(aiTaskMapper::toResponse)
                .toList();
    }
}
