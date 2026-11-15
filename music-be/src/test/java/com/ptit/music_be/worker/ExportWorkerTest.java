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
import com.ptit.music_be.client.MusicXmlNormalizeResult;
import com.ptit.music_be.dto.enums.ai.AiTaskError;
import com.ptit.music_be.dto.enums.ai.AiTaskStatus;
import com.ptit.music_be.dto.enums.ai.AiTaskType;
import com.ptit.music_be.dto.enums.score.FileType;
import com.ptit.music_be.entity.AiTask;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.exception.MuseScoreException;
import com.ptit.music_be.repository.ai.AiTaskRepository;
import com.ptit.music_be.repository.score.ScoreFileRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.service.ai.MuseScoreCliService;
import com.ptit.music_be.service.storage.FileStorageService;

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
    ScoreRepository scoreRepository;

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
                scoreRepository,
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

    // ---------------------------------------------------------------- SVG

    /** MuseScore giả: ghi {@code out-1.svg}, {@code out-2.svg}, {@code out-10.svg} cạnh file đầu ra. */
    void museScoreWritesSvgPages(Runnable beforeWrite) {
        doAnswer(invocation -> {
                    beforeWrite.run();
                    Path output = invocation.getArgument(1);
                    Files.createDirectories(output.getParent());
                    for (int page : new int[] {10, 2, 1}) {
                        Files.writeString(output.resolveSibling("out-" + page + ".svg"), "<svg>" + page + "</svg>");
                    }
                    return null;
                })
                .when(museScoreCliService)
                .convert(any(Path.class), any(Path.class), anyList(), eq(TASK_ID));
    }

    @Test
    void svg_savesEveryPageAndCompletesTask() throws Exception {
        setInput("SVG", "{}");
        museScoreWritesSvgPages(() -> {});

        worker.process(TASK_ID);

        assertThat(task.getStatus()).isEqualTo(AiTaskStatus.COMPLETED);
        assertThat(objectMapper.readTree(task.getResultData()).get("pageCount").asInt())
                .isEqualTo(3);
        assertThat(root.resolve("scores/s1/export/v3-task1-p01.svg")).hasContent("<svg>1</svg>");
        assertThat(root.resolve("scores/s1/export/v3-task1-p02.svg")).hasContent("<svg>2</svg>");
        // Trang số 10 phải đứng sau trang 2 (sắp theo số chứ không theo chữ)
        assertThat(root.resolve("scores/s1/export/v3-task1-p03.svg")).hasContent("<svg>10</svg>");
        assertThat(root.resolve("scores/s1/tmp/task1")).doesNotExist();
        verify(aiServiceClient, never())
                .prepareMusicXml(anyString(), anyString(), anyInt(), anyInt(), anyString(), any(), any(), any(), any());
        verify(museScoreCliService).convert(eq(root.resolve(SOURCE)), any(Path.class), eq(List.of()), eq(TASK_ID));

        org.mockito.ArgumentCaptor<ScoreFile> captor = org.mockito.ArgumentCaptor.forClass(ScoreFile.class);
        verify(scoreFileRepository, org.mockito.Mockito.times(3)).save(captor.capture());
        assertThat(captor.getAllValues()).extracting(ScoreFile::getPageNumber).containsExactly(1, 2, 3);
        assertThat(captor.getAllValues()).extracting(ScoreFile::getFileType).containsOnly(FileType.SVG);
        assertThat(captor.getAllValues()).extracting(ScoreFile::getSourceTaskId).containsOnly(TASK_ID);
        assertThat(captor.getValue().getOriginalFileName()).isEqualTo("Bài ca  thử nghiệm-trang-03.svg");
    }

    @Test
    void svg_cancelledWhileRendering_discardsPages() throws Exception {
        setInput("SVG", "{}");
        museScoreWritesSvgPages(() -> task.setStatus(AiTaskStatus.CANCELLED));

        worker.process(TASK_ID);

        assertThat(task.getStatus()).isEqualTo(AiTaskStatus.CANCELLED);
        assertThat(root.resolve("scores/s1/export")).doesNotExist();
        verify(scoreFileRepository, never()).save(any(ScoreFile.class));
    }

    @Test
    void collectSvgPages_singlePageScoreUsesTheOutputFileItself() throws Exception {
        Path output = root.resolve("t/out.svg");
        Files.createDirectories(output.getParent());
        Files.writeString(output, "<svg/>");

        assertThat(ExportWorker.collectSvgPages(output)).containsExactly(output);
        assertThat(ExportWorker.collectSvgPages(root.resolve("t/other.svg"))).isEmpty();
    }

    // ---------------------------------------------------------------- MIDI -> MusicXML

    static final String RAW = "scores/s1/tmp/task1/raw.musicxml";
    static final String V1 = "scores/s1/musicxml/v1.musicxml";

    /** Bản nhạc chỉ có MIDI gốc: nguồn của task là file .mid, kết quả là MusicXML. */
    void givenMidiConversionTask() {
        setInput("MUSICXML", "{}");
        ScoreFile midi = ScoreFile.builder()
                .id("src")
                .fileType(FileType.ORIGINAL_MIDI)
                .storagePath("scores/s1/original/song.mid")
                .build();
        when(scoreFileRepository.findById("src")).thenReturn(Optional.of(midi));
        when(scoreRepository.findByIdForUpdate(SCORE_ID)).thenReturn(Optional.of(task.getScore()));
    }

    /** MuseScore giả ghi raw.musicxml; music-ai giả ghi v1.musicxml rồi trả metadata. */
    void midiToolsWork(Runnable duringNormalize) throws IOException {
        doAnswer(invocation -> {
                    Path output = invocation.getArgument(1);
                    Files.createDirectories(output.getParent());
                    Files.writeString(output, "<raw/>");
                    return null;
                })
                .when(museScoreCliService)
                .convert(any(Path.class), any(Path.class), anyList(), eq(TASK_ID));
        when(aiServiceClient.normalizeMusicXml(RAW, V1)).thenAnswer(invocation -> {
            duringNormalize.run();
            Path target = root.resolve(V1);
            Files.createDirectories(target.getParent());
            Files.writeString(target, "<score-partwise/>");
            return new MusicXmlNormalizeResult(12, 2, "G", "3/4", 96, List.of("Hai track được gộp"));
        });
    }

    @Test
    void midiConversion_writesVersionOneAndUpdatesScore() throws Exception {
        givenMidiConversionTask();
        midiToolsWork(() -> {});

        worker.process(TASK_ID);

        assertThat(task.getStatus()).isEqualTo(AiTaskStatus.COMPLETED);
        assertThat(root.resolve(V1)).hasContent("<score-partwise/>");
        assertThat(root.resolve("scores/s1/tmp/task1")).doesNotExist();
        verify(museScoreCliService)
                .convert(
                        eq(root.resolve("scores/s1/original/song.mid")),
                        eq(root.resolve(RAW)),
                        eq(List.of()),
                        eq(TASK_ID));

        Score score = task.getScore();
        assertThat(score.getCurrentVersion()).isEqualTo(1);
        assertThat(score.getMeasureCount()).isEqualTo(12);
        assertThat(score.getStaffCount()).isEqualTo(2);
        assertThat(score.getKeySignature()).isEqualTo("G");
        assertThat(score.getTimeSignature()).isEqualTo("3/4");
        assertThat(score.getTempoBpm()).isEqualTo(96);

        org.mockito.ArgumentCaptor<ScoreFile> captor = org.mockito.ArgumentCaptor.forClass(ScoreFile.class);
        verify(scoreFileRepository).save(captor.capture());
        assertThat(captor.getValue().getFileType()).isEqualTo(FileType.MUSICXML);
        assertThat(captor.getValue().getVersion()).isEqualTo(1);
        assertThat(captor.getValue().getIsCurrent()).isTrue();
        assertThat(captor.getValue().getStoragePath()).isEqualTo(V1);
        assertThat(objectMapper
                        .readTree(task.getResultData())
                        .get("warnings")
                        .get(0)
                        .asText())
                .isEqualTo("Hai track được gộp");
    }

    @Test
    void midiConversion_refusedWhenScoreAlreadyHasMusicXml() throws Exception {
        givenMidiConversionTask();
        ScoreFile existing =
                ScoreFile.builder().fileType(FileType.MUSICXML).version(1).build();
        when(scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(SCORE_ID, FileType.MUSICXML))
                .thenReturn(List.of(existing));

        worker.process(TASK_ID);

        assertThat(task.getStatus()).isEqualTo(AiTaskStatus.FAILED);
        assertThat(task.getErrorMessage()).contains("đã có MusicXML");
        verify(museScoreCliService, never()).convert(any(), any(), anyList(), anyString());
    }

    @Test
    void midiConversion_normalizeRejected_failsWithReasonAndLeavesNoFile() throws Exception {
        givenMidiConversionTask();
        midiToolsWork(() -> {});
        doThrow(org.springframework.web.client.HttpClientErrorException.create(
                        org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY,
                        "Unprocessable",
                        org.springframework.http.HttpHeaders.EMPTY,
                        "{\"detail\":\"MusicXML hỏng\"}".getBytes(java.nio.charset.StandardCharsets.UTF_8),
                        java.nio.charset.StandardCharsets.UTF_8))
                .when(aiServiceClient)
                .normalizeMusicXml(RAW, V1);

        worker.process(TASK_ID);

        assertThat(task.getStatus()).isEqualTo(AiTaskStatus.FAILED);
        assertThat(task.getErrorMessage()).startsWith("EXPORT_ERROR").contains("MusicXML hỏng");
        assertThat(root.resolve(V1)).doesNotExist();
        verify(scoreFileRepository, never()).save(any(ScoreFile.class));
    }

    @Test
    void midiConversion_cancelledWhileNormalizing_removesTheWrittenFile() throws Exception {
        givenMidiConversionTask();
        midiToolsWork(() -> task.setStatus(AiTaskStatus.CANCELLED));

        worker.process(TASK_ID);

        assertThat(task.getStatus()).isEqualTo(AiTaskStatus.CANCELLED);
        assertThat(root.resolve(V1)).doesNotExist();
        verify(scoreFileRepository, never()).save(any(ScoreFile.class));
        // Bị hủy thì bản nhạc không được lên version 1
        assertThat(task.getScore().getCurrentVersion()).isNotEqualTo(1);
    }

    // ---------------------------------------------------------------- PDF

    static final String PDF_OPTIONS = "{\"marginMm\":20,\"measureNumbers\":\"NONE\",\"orientation\":\"LANDSCAPE\","
            + "\"pageSize\":\"LETTER\",\"showChords\":false,\"showTitle\":true,\"staffSpaceMm\":2.0}";

    /** MuseScore giả: ghi PDF (hoặc nội dung giả) và chụp lại nội dung file style được truyền qua -S. */
    void museScoreWritesPdf(String content, java.util.concurrent.atomic.AtomicReference<String> styleSeen) {
        doAnswer(invocation -> {
                    List<String> args = invocation.getArgument(2);
                    styleSeen.set(Files.readString(Path.of(args.get(1))));
                    Path output = invocation.getArgument(1);
                    Files.createDirectories(output.getParent());
                    Files.writeString(output, content);
                    return null;
                })
                .when(museScoreCliService)
                .convert(any(Path.class), any(Path.class), anyList(), eq(TASK_ID));
    }

    @Test
    void pdf_preparesTitleAndStripsChordsThenRendersWithStyle() throws Exception {
        setInput("PDF", PDF_OPTIONS);
        task.getScore().setComposer("Tác giả");
        var styleSeen = new java.util.concurrent.atomic.AtomicReference<String>();
        museScoreWritesPdf("%PDF-1.4 nội dung", styleSeen);

        worker.process(TASK_ID);

        assertThat(task.getStatus()).isEqualTo(AiTaskStatus.COMPLETED);
        verify(aiServiceClient)
                .prepareMusicXml(
                        eq(SOURCE),
                        eq("scores/s1/tmp/task1/in.musicxml"),
                        eq(0),
                        eq(100),
                        eq("BOTH"),
                        eq("Bài ca: thử/nghiệm"),
                        eq("Tác giả"),
                        eq(true),
                        eq(true)); // showChords = false -> stripHarmony = true
        verify(museScoreCliService)
                .convert(
                        eq(root.resolve("scores/s1/tmp/task1/in.musicxml")),
                        any(Path.class),
                        eq(List.of(
                                "-S",
                                root.resolve("scores/s1/tmp/task1/style.mss").toString())),
                        eq(TASK_ID));
        assertThat(styleSeen.get())
                .contains("<pageWidth>11</pageWidth>")
                .contains("<pageHeight>8.5</pageHeight>")
                .contains("<Spatium>2</Spatium>")
                .contains("<showMeasureNumber>0</showMeasureNumber>");
        assertThat(root.resolve("scores/s1/export/v3-task1.pdf")).hasContent("%PDF-1.4 nội dung");
        assertThat(root.resolve("scores/s1/tmp/task1")).doesNotExist();

        org.mockito.ArgumentCaptor<ScoreFile> captor = org.mockito.ArgumentCaptor.forClass(ScoreFile.class);
        verify(scoreFileRepository).save(captor.capture());
        assertThat(captor.getValue().getFileType()).isEqualTo(FileType.PDF);
        assertThat(captor.getValue().getContentType()).isEqualTo("application/pdf");
        assertThat(captor.getValue().getOriginalFileName()).isEqualTo("Bài ca  thử nghiệm.pdf");
    }

    @Test
    void pdf_hiddenTitleAndChordsKept() throws Exception {
        setInput(
                "PDF",
                "{\"marginMm\":15,\"measureNumbers\":\"SYSTEM\",\"orientation\":\"PORTRAIT\",\"pageSize\":\"A4\","
                        + "\"showChords\":true,\"showTitle\":false,\"staffSpaceMm\":1.75}");
        museScoreWritesPdf("%PDF-1.7", new java.util.concurrent.atomic.AtomicReference<>());

        worker.process(TASK_ID);

        assertThat(task.getStatus()).isEqualTo(AiTaskStatus.COMPLETED);
        verify(aiServiceClient)
                .prepareMusicXml(
                        anyString(), anyString(), eq(0), eq(100), eq("BOTH"), any(), any(), eq(false), eq(false));
    }

    @Test
    void pdf_outputThatIsNotPdfFailsTheTask() throws Exception {
        setInput("PDF", PDF_OPTIONS);
        museScoreWritesPdf("<html>không phải PDF</html>", new java.util.concurrent.atomic.AtomicReference<>());

        worker.process(TASK_ID);

        assertThat(task.getStatus()).isEqualTo(AiTaskStatus.FAILED);
        assertThat(task.getErrorMessage()).startsWith("EXPORT_ERROR");
        assertThat(root.resolve("scores/s1/export")).doesNotExist();
        verify(scoreFileRepository, never()).save(any(ScoreFile.class));
    }
}
