package com.ptit.music_be.service.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.enums.ai.AiTaskStatus;
import com.ptit.music_be.dto.enums.ai.AiTaskType;
import com.ptit.music_be.dto.enums.notification.NotificationType;
import com.ptit.music_be.entity.AiTask;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.service.notification.NotificationService;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AiTaskNotifierTest {

    @Mock
    NotificationService notificationService;

    @Mock
    ScoreRepository scoreRepository;

    AiTaskNotifier notifier() {
        return new AiTaskNotifier(notificationService, scoreRepository, new ObjectMapper());
    }

    private AiTask chordTask(AiTaskStatus status, String resultData) {
        Member member = Member.builder().id("m-1").build();
        Score score = Score.builder().id("s-1").title("Bèo dạt mây trôi").build();
        when(scoreRepository.existsById("s-1")).thenReturn(true);
        return AiTask.builder()
                .id("task-1")
                .member(member)
                .score(score)
                .taskType(AiTaskType.CHORD_GENERATION)
                .status(status)
                .resultData(resultData)
                .build();
    }

    @Test
    void chordSuggestionDoneTellsTheRequesterAndCarriesTheSuggestionId() {
        AiTask task = chordTask(AiTaskStatus.COMPLETED, "{\"suggestionId\":\"sug-1\",\"key\":\"C major\"}");

        notifier().finished(task);

        ArgumentCaptor<Map<String, String>> params = ArgumentCaptor.forClass(Map.class);
        verify(notificationService)
                .notify(
                        eq(task.getMember()),
                        eq(null),
                        eq(NotificationType.AI_TASK_COMPLETED),
                        eq("s-1"),
                        anyString(),
                        params.capture());
        assertThat(params.getValue())
                .containsEntry("variant", "chords")
                .containsEntry("suggestionId", "sug-1")
                .containsEntry("title", "Bèo dạt mây trôi");
    }

    @Test
    void chordSuggestionDoneWithUnreadableResultStillNotifiesWithoutSuggestionId() {
        AiTask task = chordTask(AiTaskStatus.COMPLETED, "not json");

        notifier().finished(task);

        ArgumentCaptor<Map<String, String>> params = ArgumentCaptor.forClass(Map.class);
        verify(notificationService)
                .notify(any(), any(), eq(NotificationType.AI_TASK_COMPLETED), any(), anyString(), params.capture());
        assertThat(params.getValue()).doesNotContainKey("suggestionId");
    }
}
