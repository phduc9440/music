package com.ptit.music_be.service.admin.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import jakarta.persistence.EntityManager;

import org.junit.jupiter.api.Test;

import com.ptit.music_be.dto.enums.AiTaskStatus;
import com.ptit.music_be.dto.enums.AiTaskType;
import com.ptit.music_be.dto.response.AiTaskResponse;
import com.ptit.music_be.entity.AiTask;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.AiTaskRepository;
import com.ptit.music_be.service.ai.OmrService;

class AdminAiTaskRetryTest {

    private final AiTaskRepository repo = mock(AiTaskRepository.class);
    private final OmrService omr = mock(OmrService.class);
    private final AdminAiTaskServiceImpl service = new AdminAiTaskServiceImpl(mock(EntityManager.class), repo, omr);

    private AiTask task(String id, AiTaskType type, AiTaskStatus status) {
        AiTask t = AiTask.builder()
                .id(id)
                .taskType(type)
                .status(status)
                .score(Score.builder().id("s1").title("Bài").build())
                .member(Member.builder().email("owner@x.com").build())
                .build();
        when(repo.findById(id)).thenReturn(Optional.of(t));
        return t;
    }

    @Test
    void failedOmrTaskIsRetriedForTheSameScore() {
        task("old", AiTaskType.OMR_CONVERSION, AiTaskStatus.FAILED);
        task("new", AiTaskType.OMR_CONVERSION, AiTaskStatus.PENDING);
        when(omr.retryAsAdmin("s1"))
                .thenReturn(AiTaskResponse.builder().id("new").build());

        assertEquals("new", service.retry("old").getId());
        verify(omr).retryAsAdmin("s1");
    }

    @Test
    void onlyFailedOrCancelledOmrTasksCanBeRetried() {
        task("done", AiTaskType.OMR_CONVERSION, AiTaskStatus.COMPLETED);
        task("running", AiTaskType.OMR_CONVERSION, AiTaskStatus.PROCESSING);
        task("audio", AiTaskType.AUDIO_SYNTHESIS, AiTaskStatus.FAILED);

        for (String id : new String[] {"done", "running", "audio"}) {
            AppException e = assertThrows(AppException.class, () -> service.retry(id));
            assertEquals(ErrorCode.AI_TASK_NOT_RETRYABLE, e.getErrorCode());
        }
        verify(omr, never()).retryAsAdmin(any());
    }
}
