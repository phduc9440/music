package com.ptit.music_be.worker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.Resource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.client.AiServiceClient;
import com.ptit.music_be.dto.enums.AiTaskError;
import com.ptit.music_be.dto.enums.AiTaskStatus;
import com.ptit.music_be.dto.enums.AiTaskType;
import com.ptit.music_be.dto.enums.FileType;
import com.ptit.music_be.entity.AiTask;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.exception.MuseScoreException;
import com.ptit.music_be.repository.AiTaskRepository;
import com.ptit.music_be.repository.ScoreFileRepository;
import com.ptit.music_be.service.FileStorageService;
import com.ptit.music_be.service.MuseScoreCliService;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ExportWorkerTest {

    static final String TASK_ID = "task1";
    static final String SCORE_ID = "s1";
    static final String SOURCE = "scores/s1/musicxml/v3.musicxml";

    @Mock
    AiTaskRepository aiTaskRepository;

    @Mock
    ScoreFileRepository scoreFileRepository;

    @Mock
    MuseScoreCliService museScoreCliService;

    @Mock
    AiServiceClient aiServiceClient;

    @Mock
    PlatformTransactionManager transactionManager;

    @TempDir
    Path root;

    final ObjectMapper objectMapper = new ObjectMapper();
    DiskStorage storage;
    ExportWorker worker;
    AiTask task;

    /** Lưu trữ thật trên thư mục tạm để kiểm tra file được ghi và dọn đúng. */
    static class DiskStorage implements FileStorageService {
        final Path root;

        DiskStorage(Path root) {
            this.root = root;
        }

        @Override
        public String store(InputStream inputStream, String relativePath) {
            try {
                Path target = root.resolve(relativePath);
                Files.createDirectories(target.getParent());
                Files.copy(inputStream, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                return relativePath;
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
        }

        @Override
        public Resource loadAsResource(String relativePath) {
            throw new UnsupportedOperationException();
        }

        @Override
        public Path resolve(String relativePath) {
            return root.resolve(relativePath);
        }

        @Override
        public void delete(String relativePath) {
            try {
                Files.deleteIfExists(resolve(relativePath));
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
        }

        @Override
        public void deleteDirectory(String relativeDir) {
            Path dir = resolve(relativeDir);
            if (!Files.exists(dir)) {
                return;
            }
            try (Stream<Path> walk = Files.walk(dir)) {
                walk.sorted(Comparator.reverseOrder()).forEach(p -> p.toFile().delete());
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
        }
    }

    @BeforeEach
    void setUp() {
        storage = new DiskStorage(root);
        when(transactionManager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        worker = new ExportWorker(
                aiTaskRepository,
                scoreFileRepository,
                storage,
                museScoreCliService,
                aiServiceClient,
                objectMapper,
                transactionManager);

        Score score = new Score();
        score.setId(SCORE_ID);
        score.setTitle("Bài ca: thử/nghiệm");
        task = AiTask.builder()
                .id(TASK_ID)
                .score(score)
                .taskType(AiTaskType.AUDIO_SYNTHESIS)
                .status(AiTaskStatus.PENDING)
                .build();
        setInput("MP3", "{\"bitrate\":320,\"hands\":\"BOTH\",\"tempoPercent\":100,\"transpose\":0}");

        ScoreFile source =
                ScoreFile.builder().id("src").storagePath(SOURCE).version(3).build();
        when(aiTaskRepository.findByIdForUpdate(TASK_ID)).thenReturn(Optional.of(task));
        when(aiTaskRepository.findById(TASK_ID)).thenReturn(Optional.of(task));
        when(aiTaskRepository.save(any(AiTask.class))).thenAnswer(i -> i.getArgument(0));
        when(scoreFileRepository.findById("src")).thenReturn(Optional.of(source));
        when(scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(anyString(), any(FileType.class)))
                .thenReturn(List.of());
        when(scoreFileRepository.save(any(ScoreFile.class))).thenAnswer(i -> {
            ScoreFile file = i.getArgument(0);
            if (file.getId() == null) {
                file.setId("file-1");
            }
            return file;
        });
    }

    void setInput(String format, String optionsJson) {
        task.setInputData("{\"targetFormat\":\"" + format
                + "\",\"sourceFileId\":\"src\",\"sourceVersion\":3,\"options\":" + optionsJson + "}");
    }

    /** MuseScore giả: ghi vài byte vào file đầu ra (đối số thứ hai). */
    void museScoreWritesOutput(Runnable beforeWrite) throws IOException {
        doAnswer(invocation -> {
                    beforeWrite.run();
                    Path output = invocation.getArgument(1);
                    Files.createDirectories(output.getParent());
                    Files.writeString(output, "audio-bytes");
                    return null;
                })
                .when(museScoreCliService)
                .convert(any(Path.class), any(Path.class), anyList(), eq(TASK_ID));
    }

    @Test
    void success_withoutPrepare_savesMp3AndCompletesTask() throws Exception {
        museScoreWritesOutput(() -> {});

        worker.process(TASK_ID);

        assertThat(task.getStatus()).isEqualTo(AiTaskStatus.COMPLETED);
        assertThat(task.getProgress()).isEqualTo(100);
        assertThat(objectMapper.readTree(task.getResultData()).get("fileId").asText())
                .isEqualTo("file-1");
        Path saved = root.resolve("scores/s1/audio/v3-task1.mp3");
        assertThat(saved).hasContent("audio-bytes");
        assertThat(root.resolve("scores/s1/tmp/task1")).doesNotExist();
        // Mặc định không đổi gì thì không gọi music-ai; MP3 truyền bitrate cho MuseScore
        verify(aiServiceClient, never())
                .prepareMusicXml(anyString(), anyString(), anyInt(), anyInt(), anyString(), any(), any(), any(), any());
        verify(museScoreCliService)
                .convert(eq(root.resolve(SOURCE)), any(Path.class), eq(List.of("-b", "320")), eq(TASK_ID));

        org.mockito.ArgumentCaptor<ScoreFile> captor = org.mockito.ArgumentCaptor.forClass(ScoreFile.class);
        verify(scoreFileRepository).save(captor.capture());
        ScoreFile file = captor.getValue();
        assertThat(file.getFileType()).isEqualTo(FileType.MP3);
        assertThat(file.getVersion()).isEqualTo(3);
        assertThat(file.getSourceTaskId()).isEqualTo(TASK_ID);
        assertThat(file.getContentType()).isEqualTo("audio/mpeg");
        assertThat(file.getOriginalFileName()).isEqualTo("Bài ca  thử nghiệm.mp3");
        assertThat(objectMapper.readTree(file.getMeta()).get("sourceVersion").asInt())
                .isEqualTo(3);
    }

    @Test
    void success_withTransposeAndTempo_callsPrepareThenUsesItsOutput() throws Exception {
        setInput("WAV", "{\"hands\":\"LEFT\",\"tempoPercent\":75,\"transpose\":2}");
        museScoreWritesOutput(() -> {});

        worker.process(TASK_ID);

        verify(aiServiceClient)
                .prepareMusicXml(
                        eq(SOURCE),
                        eq("scores/s1/tmp/task1/in.musicxml"),
                        eq(2),
                        eq(75),
                        eq("LEFT"),
                        isNull(),
                        isNull(),
                        isNull(),
                        isNull());
        verify(museScoreCliService)
                .convert(
                        eq(root.resolve("scores/s1/tmp/task1/in.musicxml")),
                        any(Path.class),
                        eq(List.of()),
                        eq(TASK_ID));
        assertThat(task.getStatus()).isEqualTo(AiTaskStatus.COMPLETED);
        assertThat(root.resolve("scores/s1/audio/v3-task1.wav")).exists();
    }

    @Test
    void museScoreTimeout_failsTaskAndCleansTmp() throws Exception {
        doThrow(new MuseScoreException(AiTaskError.MUSESCORE_TIMEOUT, "quá 120 giây"))
                .when(museScoreCliService)
                .convert(any(Path.class), any(Path.class), anyList(), eq(TASK_ID));

        worker.process(TASK_ID);

        assertThat(task.getStatus()).isEqualTo(AiTaskStatus.FAILED);
        assertThat(task.getErrorMessage()).startsWith("MUSESCORE_TIMEOUT");
        assertThat(root.resolve("scores/s1/audio")).doesNotExist();
        verify(scoreFileRepository, never()).save(any(ScoreFile.class));
    }

    @Test
    void aiServiceDown_failsWithAiServiceUnavailable() {
        setInput("MP3", "{\"bitrate\":192,\"hands\":\"BOTH\",\"tempoPercent\":50,\"transpose\":0}");
        doThrow(new org.springframework.web.client.ResourceAccessException("connection refused"))
                .when(aiServiceClient)
                .prepareMusicXml(anyString(), anyString(), anyInt(), anyInt(), anyString(), any(), any(), any(), any());

        worker.process(TASK_ID);

        assertThat(task.getStatus()).isEqualTo(AiTaskStatus.FAILED);
        assertThat(task.getErrorMessage()).isEqualTo("AI_SERVICE_UNAVAILABLE");
    }

    @Test
    void cancelledWhileRendering_discardsResult() throws Exception {
        museScoreWritesOutput(() -> task.setStatus(AiTaskStatus.CANCELLED));

        worker.process(TASK_ID);

        assertThat(task.getStatus()).isEqualTo(AiTaskStatus.CANCELLED);
        assertThat(root.resolve("scores/s1/audio/v3-task1.mp3")).doesNotExist();
        verify(scoreFileRepository, never()).save(any(ScoreFile.class));
    }

    @Test
    void taskNotPending_isIgnored() {
        task.setStatus(AiTaskStatus.CANCELLED);

        worker.process(TASK_ID);

        verify(museScoreCliService, never()).convert(any(), any(), anyList(), anyString());
        assertThat(task.getStatus()).isEqualTo(AiTaskStatus.CANCELLED);
    }

    @Test
    void fail_doesNotOverrideFinishedTask() {
        task.setStatus(AiTaskStatus.COMPLETED);
        worker.fail(TASK_ID, "TASK_TIMEOUT");
        assertThat(task.getStatus()).isEqualTo(AiTaskStatus.COMPLETED);

        task.setStatus(AiTaskStatus.PROCESSING);
        worker.fail(TASK_ID, "TASK_TIMEOUT");
        assertThat(task.getStatus()).isEqualTo(AiTaskStatus.FAILED);
    }
}
