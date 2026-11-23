package com.ptit.music_be.worker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.client.AiServiceClient;
import com.ptit.music_be.client.ChordGenerationResult;
import com.ptit.music_be.dto.enums.ai.AiTaskStatus;
import com.ptit.music_be.dto.enums.ai.AiTaskType;
import com.ptit.music_be.dto.enums.score.SuggestionSource;
import com.ptit.music_be.dto.response.score.ScoreContent;
import com.ptit.music_be.entity.AiTask;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreSuggestion;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.code.AccountErrorCode;
import com.ptit.music_be.exception.code.CollabErrorCode;
import com.ptit.music_be.repository.ai.AiTaskRepository;
import com.ptit.music_be.service.score.ScoreEditService;
import com.ptit.music_be.service.score.SuggestionService;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ChordGenerationWorkerTest {

    static final String TASK_ID = "task-1";
    static final String SCORE_ID = "s1";
    static final String IN = "scores/s1/chords/task-1-in.musicxml";
    static final String OUT = "scores/s1/chords/task-1-out.musicxml";
    static final byte[] BASE = "<score-partwise/>".getBytes(StandardCharsets.UTF_8);
    static final byte[] WITH_CHORDS = "<score-partwise><harmony/></score-partwise>".getBytes(StandardCharsets.UTF_8);

    @Mock
    AiTaskRepository aiTaskRepository;

    @Mock
    ScoreEditService scoreEditService;

    @Mock
    SuggestionService suggestionService;

    @Mock
    AiServiceClient aiServiceClient;

    @Mock
    PlatformTransactionManager transactionManager;

    @TempDir
    Path root;

    final ObjectMapper objectMapper = new ObjectMapper();
    ExportWorkerTest.DiskStorage storage;
    ChordGenerationWorker worker;
    AiTask task;

    @BeforeEach
    void setUp() {
        storage = new ExportWorkerTest.DiskStorage(root);
        when(transactionManager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        worker = new ChordGenerationWorker(
                aiTaskRepository,
                scoreEditService,
                suggestionService,
                storage,
                aiServiceClient,
                objectMapper,
                transactionManager);
        Score score = Score.builder().id(SCORE_ID).build();
        task = AiTask.builder()
                .id(TASK_ID)
                .score(score)
                .taskType(AiTaskType.CHORD_GENERATION)
                .status(AiTaskStatus.PENDING)
                .inputData("{\"style\":\"NATURAL\",\"baseVersion\":7}")
                .build();
        when(aiTaskRepository.findByIdForUpdate(TASK_ID)).thenReturn(Optional.of(task));
        when(aiTaskRepository.findById(TASK_ID)).thenReturn(Optional.of(task));
        when(aiTaskRepository.save(any(AiTask.class))).thenAnswer(i -> i.getArgument(0));
        when(scoreEditService.getVersionContentForSystem(SCORE_ID, 7)).thenReturn(new ScoreContent(BASE, 7));
        // Luồng nền không có người đăng nhập: đọc có kiểm quyền sẽ lỗi
        when(scoreEditService.getVersionContent(any(), anyInt()))
                .thenThrow(new AppException(AccountErrorCode.UNAUTHENTICATED));
    }

    /** music-ai giả: kiểm tra file vào đúng là version gốc rồi ghi file ra có hợp âm. */
    private void aiWritesChords() {
        when(aiServiceClient.generateChords(IN, OUT, "NATURAL", false, "BALANCED", "NORMAL"))
                .thenAnswer(inv -> {
                    assertThat(Files.readAllBytes(root.resolve(IN))).isEqualTo(BASE);
                    Files.createDirectories(root.resolve(OUT).getParent());
                    Files.write(root.resolve(OUT), WITH_CHORDS);
                    return new ChordGenerationResult(OUT, "C major", 8, 4, 0, 0, 1L, null);
                });
    }

    private void assertTempFilesGone() {
        assertThat(root.resolve(IN)).doesNotExist();
        assertThat(root.resolve(OUT)).doesNotExist();
    }

    @Test
    void completesAndCreatesSuggestion() throws IOException {
        aiWritesChords();
        when(suggestionService.createFromSystem(
                        eq(SCORE_ID), any(), eq(7), eq(SuggestionSource.CHORD_GENERATION), anyString(), anyString()))
                .thenReturn(ScoreSuggestion.builder().id("sug-1").build());

        worker.process(TASK_ID);

        ArgumentCaptor<byte[]> body = ArgumentCaptor.forClass(byte[].class);
        ArgumentCaptor<String> title = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> description = ArgumentCaptor.forClass(String.class);
        verify(suggestionService)
                .createFromSystem(
                        eq(SCORE_ID),
                        body.capture(),
                        eq(7),
                        eq(SuggestionSource.CHORD_GENERATION),
                        title.capture(),
                        description.capture());
        assertThat(body.getValue()).isEqualTo(WITH_CHORDS);
        assertThat(title.getValue()).isEqualTo("Gợi ý hợp âm (Tự nhiên)");
        assertThat(description.getValue()).contains("C major");
        assertThat(task.getStatus()).isEqualTo(AiTaskStatus.COMPLETED);
        assertThat(task.getProgress()).isEqualTo(100);
        assertThat(task.getFinishedAt()).isNotNull();
        assertThat(objectMapper
                        .readTree(task.getResultData())
                        .path("suggestionId")
                        .asText())
                .isEqualTo("sug-1");
        assertThat(objectMapper.readTree(task.getResultData()).path("key").asText())
                .isEqualTo("C major");
        assertTempFilesGone();
    }

    @Test
    void doesNotCreateSuggestionWhenTaskTimedOutMeanwhile() {
        // Job quét báo TASK_TIMEOUT trong lúc music-ai còn chạy
        when(aiServiceClient.generateChords(IN, OUT, "NATURAL", false, "BALANCED", "NORMAL"))
                .thenAnswer(inv -> {
                    Files.createDirectories(root.resolve(OUT).getParent());
                    Files.write(root.resolve(OUT), WITH_CHORDS);
                    task.setStatus(AiTaskStatus.FAILED);
                    task.setErrorMessage("TASK_TIMEOUT");
                    return new ChordGenerationResult(OUT, "C major", 8, 4, 0, 0, 1L, null);
                });

        worker.process(TASK_ID);

        verifyNoInteractions(suggestionService);
        assertThat(task.getStatus()).isEqualTo(AiTaskStatus.FAILED);
        assertThat(task.getErrorMessage()).isEqualTo("TASK_TIMEOUT");
        assertTempFilesGone();
    }

    @Test
    void failsTaskAndCleansTempWhenAiRejects() {
        when(aiServiceClient.generateChords(IN, OUT, "NATURAL", false, "BALANCED", "NORMAL"))
                .thenThrow(HttpClientErrorException.create(
                        HttpStatus.UNPROCESSABLE_ENTITY,
                        "Unprocessable",
                        HttpHeaders.EMPTY,
                        "{\"detail\":{\"code\":\"NO_MELODY\",\"message\":\"x\"}}".getBytes(StandardCharsets.UTF_8),
                        StandardCharsets.UTF_8));

        worker.process(TASK_ID);

        assertThat(task.getStatus()).isEqualTo(AiTaskStatus.FAILED);
        assertThat(task.getErrorMessage()).startsWith("CHORD_NO_MELODY");
        verifyNoInteractions(suggestionService);
        assertTempFilesGone();
    }

    @Test
    void alreadyHarmonizedFromAiIsMapped() {
        when(aiServiceClient.generateChords(IN, OUT, "NATURAL", false, "BALANCED", "NORMAL"))
                .thenThrow(HttpClientErrorException.create(
                        HttpStatus.UNPROCESSABLE_ENTITY,
                        "Unprocessable",
                        HttpHeaders.EMPTY,
                        "{\"detail\":{\"code\":\"ALREADY_HARMONIZED\"}}".getBytes(StandardCharsets.UTF_8),
                        StandardCharsets.UTF_8));

        worker.process(TASK_ID);

        assertThat(task.getErrorMessage()).isEqualTo("CHORD_ALREADY_HARMONIZED");
    }

    @Test
    void emptySuggestionMeansAlreadyHarmonized() {
        aiWritesChords();
        when(suggestionService.createFromSystem(any(), any(), anyInt(), any(), any(), any()))
                .thenThrow(new AppException(CollabErrorCode.SUGGESTION_EMPTY));

        worker.process(TASK_ID);

        assertThat(task.getStatus()).isEqualTo(AiTaskStatus.FAILED);
        assertThat(task.getErrorMessage()).isEqualTo("CHORD_ALREADY_HARMONIZED");
        assertTempFilesGone();
    }

    @Test
    void replaceModeForwardsFlagAndReportsNoChange() {
        task.setInputData("{\"style\":\"NATURAL\",\"baseVersion\":7,\"replaceExisting\":true}");
        when(aiServiceClient.generateChords(IN, OUT, "NATURAL", true, "BALANCED", "NORMAL"))
                .thenAnswer(inv -> {
                    Files.createDirectories(root.resolve(OUT).getParent());
                    Files.write(root.resolve(OUT), WITH_CHORDS);
                    return new ChordGenerationResult(OUT, "C major", 8, 4, 0, 0, 1L, null);
                });
        when(suggestionService.createFromSystem(any(), any(), anyInt(), any(), any(), any()))
                .thenThrow(new AppException(CollabErrorCode.SUGGESTION_EMPTY));

        worker.process(TASK_ID);

        assertThat(task.getStatus()).isEqualTo(AiTaskStatus.FAILED);
        assertThat(task.getErrorMessage()).isEqualTo("CHORD_NO_CHANGE");
        assertTempFilesGone();
    }

    @Test
    void storesOtherOptionsNextToSuggestionAndCleansTheirTempFiles() throws IOException {
        String out2 = "scores/s1/chords/task-1-out-2.musicxml";
        String out3 = "scores/s1/chords/task-1-out-3.musicxml";
        byte[] option2 = "<score-partwise><harmony>B</harmony></score-partwise>".getBytes(StandardCharsets.UTF_8);
        byte[] option3 = "<score-partwise><harmony>C</harmony></score-partwise>".getBytes(StandardCharsets.UTF_8);
        when(aiServiceClient.generateChords(IN, OUT, "NATURAL", false, "BALANCED", "NORMAL"))
                .thenAnswer(inv -> {
                    Files.createDirectories(root.resolve(OUT).getParent());
                    Files.write(root.resolve(OUT), WITH_CHORDS);
                    Files.write(root.resolve(out2), option2);
                    Files.write(root.resolve(out3), option3);
                    return new ChordGenerationResult(
                            OUT,
                            "C major",
                            8,
                            4,
                            0,
                            0,
                            7L,
                            java.util.List.of(
                                    new ChordGenerationResult.Option(OUT, 4, -0.1),
                                    new ChordGenerationResult.Option(out2, 3, -0.2),
                                    // đường dẫn lạ trong phản hồi bị bỏ qua
                                    new ChordGenerationResult.Option("scores/other/x.musicxml", 3, -0.3),
                                    new ChordGenerationResult.Option(out3, 5, -0.4)));
                });
        ScoreSuggestion suggestion = ScoreSuggestion.builder().id("sug-1").build();
        when(suggestionService.createFromSystem(any(), any(), anyInt(), any(), any(), any()))
                .thenReturn(suggestion);

        worker.process(TASK_ID);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<java.util.List<byte[]>> stored = ArgumentCaptor.forClass(java.util.List.class);
        verify(suggestionService).storeOptions(eq(suggestion), stored.capture());
        assertThat(stored.getValue()).containsExactly(option2, option3);
        assertThat(objectMapper.readTree(task.getResultData()).path("options").asInt())
                .isEqualTo(3);
        assertThat(root.resolve(out2)).doesNotExist();
        assertThat(root.resolve(out3)).doesNotExist();
        assertTempFilesGone();
    }

    @Test
    void failsWithUnavailableOnConnectionError() {
        when(aiServiceClient.generateChords(IN, OUT, "NATURAL", false, "BALANCED", "NORMAL"))
                .thenThrow(new ResourceAccessException("refused"));

        worker.process(TASK_ID);

        assertThat(task.getErrorMessage()).isEqualTo("AI_SERVICE_UNAVAILABLE");
    }

    @Test
    void failsWithUnavailableOnServerError() {
        when(aiServiceClient.generateChords(IN, OUT, "NATURAL", false, "BALANCED", "NORMAL"))
                .thenThrow(HttpServerErrorException.create(
                        HttpStatus.INTERNAL_SERVER_ERROR, "boom", HttpHeaders.EMPTY, new byte[0], null));

        worker.process(TASK_ID);

        assertThat(task.getErrorMessage()).isEqualTo("AI_SERVICE_UNAVAILABLE");
    }

    @Test
    void skipsWhenTaskNoLongerPending() {
        task.setStatus(AiTaskStatus.CANCELLED);

        worker.process(TASK_ID);

        verifyNoInteractions(aiServiceClient);
        verify(aiTaskRepository, never()).save(any());
    }

    @Test
    void watchdogFailsStuckChordTasksOnly() {
        AiTask stuck = AiTask.builder()
                .id(TASK_ID)
                .taskType(AiTaskType.CHORD_GENERATION)
                .status(AiTaskStatus.PROCESSING)
                .build();
        task.setStatus(AiTaskStatus.PROCESSING);
        when(aiTaskRepository.findByTaskTypeInAndStatusAndUpdatedAtBefore(
                        eq(List.of(AiTaskType.CHORD_GENERATION)),
                        eq(AiTaskStatus.PROCESSING),
                        any(LocalDateTime.class)))
                .thenReturn(List.of(stuck));
        ChordWatchdog watchdog = new ChordWatchdog(aiTaskRepository, worker);

        watchdog.sweep();

        assertThat(task.getStatus()).isEqualTo(AiTaskStatus.FAILED);
        assertThat(task.getErrorMessage()).isEqualTo("TASK_TIMEOUT");
        ArgumentCaptor<LocalDateTime> before = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(aiTaskRepository)
                .findByTaskTypeInAndStatusAndUpdatedAtBefore(
                        eq(List.of(AiTaskType.CHORD_GENERATION)), eq(AiTaskStatus.PROCESSING), before.capture());
        assertThat(before.getValue()).isBefore(LocalDateTime.now().minusMinutes(4));
        assertThat(before.getValue()).isAfter(LocalDateTime.now().minusMinutes(6));
    }
}
