package com.ptit.music_be.service.export.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.configuration.MuseScoreProperties;
import com.ptit.music_be.dto.enums.AiTaskStatus;
import com.ptit.music_be.dto.enums.AiTaskType;
import com.ptit.music_be.dto.enums.FileType;
import com.ptit.music_be.dto.request.ExportRequest;
import com.ptit.music_be.dto.response.AiTaskResponse;
import com.ptit.music_be.dto.response.ExportResponse;
import com.ptit.music_be.entity.AiTask;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.event.ExportTaskCreatedEvent;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.mapper.AiTaskMapper;
import com.ptit.music_be.repository.AiTaskRepository;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.ScoreFileRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.ai.MuseScoreCliService;
import com.ptit.music_be.service.export.ExportOptionsValidator;
import com.ptit.music_be.service.export.ExportService;
import com.ptit.music_be.service.score.ScoreContentService;
import com.ptit.music_be.service.score.ScoreFileService;
import com.ptit.music_be.service.storage.FileStorageService;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ExportServiceImplTest {

    static final String SCORE_ID = "score-1";
    static final String OPTIONS_JSON = "{\"bitrate\":192,\"hands\":\"BOTH\",\"tempoPercent\":75,\"transpose\":2}";

    @Mock
    ScoreRepository scoreRepository;

    @Mock
    ScoreFileRepository scoreFileRepository;

    @Mock
    AiTaskRepository aiTaskRepository;

    @Mock
    MemberRepository memberRepository;

    @Mock
    ScoreFileService scoreFileService;

    @Mock
    FileStorageService fileStorageService;

    @Mock
    MuseScoreCliService museScoreCliService;

    @Mock
    ScoreContentService scoreContentService;

    @Mock
    AiTaskMapper aiTaskMapper;

    @Mock
    ApplicationEventPublisher eventPublisher;

    @TempDir
    Path dir;

    final ObjectMapper objectMapper = new ObjectMapper();
    ExportServiceImpl service;
    Score score;
    Member member;
    ScoreFile musicXml;

    @BeforeEach
    void setUp() {
        MuseScoreProperties properties = new MuseScoreProperties("/x/mscore", 120, 2, 1200, "0 0 3 * * *");
        service = new ExportServiceImpl(
                scoreRepository,
                scoreFileRepository,
                aiTaskRepository,
                memberRepository,
                scoreFileService,
                fileStorageService,
                scoreContentService,
                museScoreCliService,
                properties,
                new ExportOptionsValidator(objectMapper),
                aiTaskMapper,
                objectMapper,
                eventPublisher);

        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("user@example.com", "n/a", "ROLE_USER"));
        member = new Member();
        member.setId("member-1");
        score = new Score();
        score.setId(SCORE_ID);
        score.setStaffCount(2);
        score.setMeasureCount(32);
        score.setTimeSignature("4/4");
        score.setTempoBpm(100);
        score.setCurrentVersion(3);
        musicXml = ScoreFile.builder()
                .id("xml-1")
                .score(score)
                .fileType(FileType.MUSICXML)
                .storagePath("scores/score-1/musicxml/v3.musicxml")
                .version(3)
                .isCurrent(true)
                .build();

        when(scoreRepository.findById(SCORE_ID)).thenReturn(Optional.of(score));
        when(museScoreCliService.isAvailable()).thenReturn(true);
        when(memberRepository.findByEmailForUpdate("user@example.com")).thenReturn(Optional.of(member));
        when(scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(SCORE_ID, FileType.MUSICXML))
                .thenReturn(List.of(musicXml));
        when(scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(SCORE_ID, FileType.MP3))
                .thenReturn(List.of());
        when(aiTaskRepository.findByScoreIdAndTaskTypeInAndStatusIn(eq(SCORE_ID), anyCollection(), anyCollection()))
                .thenReturn(List.of());
        when(aiTaskRepository.save(any(AiTask.class))).thenAnswer(invocation -> {
            AiTask task = invocation.getArgument(0);
            task.setId("task-1");
            return task;
        });
        when(aiTaskMapper.toResponse(any())).thenAnswer(invocation -> {
            AiTask task = invocation.getArgument(0);
            return AiTaskResponse.builder().id(task.getId()).build();
        });
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    ExportRequest request(String format, String optionsJson) throws Exception {
        return ExportRequest.builder()
                .targetFormat(format)
                .options(optionsJson == null ? null : objectMapper.readTree(optionsJson))
                .build();
    }

    static void assertError(Throwable thrown, ErrorCode code) {
        assertThat(thrown).isInstanceOfSatisfying(AppException.class, e -> assertThat(e.getErrorCode())
                .isEqualTo(code));
    }

    @Test
    void createsTaskAndPublishesEvent() throws Exception {
        ExportResponse response =
                service.requestExport(SCORE_ID, request("MP3", "{\"tempoPercent\":75,\"transpose\":2}"));

        assertThat(response.isCached()).isFalse();
        assertThat(response.getTask().getId()).isEqualTo("task-1");
        verify(eventPublisher).publishEvent(new ExportTaskCreatedEvent("task-1", SCORE_ID));
        AiTask saved = captureSavedTask();
        assertThat(saved.getTaskType()).isEqualTo(AiTaskType.AUDIO_SYNTHESIS);
        assertThat(saved.getStatus()).isEqualTo(AiTaskStatus.PENDING);
        assertThat(objectMapper.readTree(saved.getInputData()).get("options"))
                .isEqualTo(objectMapper.readTree(OPTIONS_JSON));
        assertThat(objectMapper
                        .readTree(saved.getInputData())
                        .get("sourceVersion")
                        .asInt())
                .isEqualTo(3);
        // Xuất file không đổi trạng thái xử lý của bản nhạc
        verify(scoreRepository, never()).save(any());
    }

    private AiTask captureSavedTask() {
        org.mockito.ArgumentCaptor<AiTask> captor = org.mockito.ArgumentCaptor.forClass(AiTask.class);
        verify(aiTaskRepository).save(captor.capture());
        return captor.getValue();
    }

    @Test
    void returnsCachedFileWhenSameOptionsAndVersion() throws Exception {
        Path file = Files.writeString(dir.resolve("a.mp3"), "data");
        when(fileStorageService.resolve("scores/score-1/audio/v3-old.mp3")).thenReturn(file);
        ScoreFile mp3 = ScoreFile.builder()
                .id("mp3-1")
                .score(score)
                .fileType(FileType.MP3)
                .storagePath("scores/score-1/audio/v3-old.mp3")
                .version(3)
                .isCurrent(true)
                .sourceTaskId("old")
                .meta("{\"sourceVersion\":3,\"options\":" + OPTIONS_JSON + "}")
                .build();
        when(scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(SCORE_ID, FileType.MP3))
                .thenReturn(List.of(mp3));

        ExportResponse response =
                service.requestExport(SCORE_ID, request("MP3", "{\"transpose\":2,\"tempoPercent\":75}"));

        assertThat(response.isCached()).isTrue();
        assertThat(response.getFile().getId()).isEqualTo("mp3-1");
        assertThat(response.getFile().isOutdated()).isFalse();
        verify(aiTaskRepository, never()).save(any());
        verify(eventPublisher, never()).publishEvent(any(Object.class));
    }

    @Test
    void doesNotUseCacheWhenVersionOrOptionsDiffer() throws Exception {
        Path file = Files.writeString(dir.resolve("a.mp3"), "data");
        when(fileStorageService.resolve(anyString())).thenReturn(file);
        ScoreFile oldVersion = ScoreFile.builder()
                .id("mp3-old")
                .score(score)
                .fileType(FileType.MP3)
                .storagePath("p")
                .version(2)
                .isCurrent(true)
                .sourceTaskId("old")
                .meta("{\"sourceVersion\":2,\"options\":" + OPTIONS_JSON + "}")
                .build();
        when(scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(SCORE_ID, FileType.MP3))
                .thenReturn(List.of(oldVersion));

        assertThat(service.requestExport(SCORE_ID, request("MP3", "{\"tempoPercent\":75,\"transpose\":2}"))
                        .isCached())
                .isFalse();
        assertThat(service.requestExport(SCORE_ID, request("MP3", "{\"tempoPercent\":50}"))
                        .isCached())
                .isFalse();
    }

    @Test
    void returnsExistingTaskInsteadOfCreatingDuplicate() throws Exception {
        AiTask running = AiTask.builder()
                .id("running-1")
                .taskType(AiTaskType.AUDIO_SYNTHESIS)
                .status(AiTaskStatus.PROCESSING)
                .inputData("{\"targetFormat\":\"MP3\",\"sourceVersion\":3,\"options\":" + OPTIONS_JSON + "}")
                .build();
        when(aiTaskRepository.findByScoreIdAndTaskTypeInAndStatusIn(eq(SCORE_ID), anyCollection(), anyCollection()))
                .thenReturn(List.of(running));

        ExportResponse response =
                service.requestExport(SCORE_ID, request("MP3", "{\"tempoPercent\":75,\"transpose\":2}"));

        assertThat(response.getTask().getId()).isEqualTo("running-1");
        verify(aiTaskRepository, never()).save(any());
    }

    @Test
    void rejectsWhenTwoTasksAlreadyRunning() {
        when(aiTaskRepository.countByMemberIdAndTaskTypeInAndStatusIn(eq("member-1"), anyCollection(), anyCollection()))
                .thenReturn(2L);
        assertThatThrownBy(() -> service.requestExport(SCORE_ID, request("MP3", null)))
                .satisfies(e -> assertError(e, ErrorCode.EXPORT_LIMIT_EXCEEDED));
    }

    @Test
    void rejectsWhenTenTasksInLastHour() {
        when(aiTaskRepository.countByMemberIdAndTaskTypeInAndCreatedAtAfter(eq("member-1"), anyCollection(), any()))
                .thenReturn(10L);
        assertThatThrownBy(() -> service.requestExport(SCORE_ID, request("MP3", null)))
                .satisfies(e -> assertError(e, ErrorCode.EXPORT_LIMIT_EXCEEDED));
    }

    @Test
    void rejectsScoreLongerThanTwentyMinutes() throws Exception {
        score.setMeasureCount(400); // 400 ô x 4 phách ở 100 bpm = 960 giây
        assertThatThrownBy(() -> service.requestExport(SCORE_ID, request("MP3", "{\"tempoPercent\":50}")))
                .satisfies(e -> assertError(e, ErrorCode.AUDIO_TOO_LONG)); // 1920 giây
        // Tăng tempo thì đủ ngắn để xuất
        assertThat(service.requestExport(SCORE_ID, request("MP3", "{\"tempoPercent\":100}"))
                        .getTask())
                .isNotNull();
    }

    @Test
    void rejectsWhenNoMusicXml() {
        when(scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(SCORE_ID, FileType.MUSICXML))
                .thenReturn(List.of());
        assertThatThrownBy(() -> service.requestExport(SCORE_ID, request("MP3", null)))
                .satisfies(e -> assertError(e, ErrorCode.MUSICXML_NOT_READY));
    }

    @Test
    void rejectsWhenMuseScoreNotConfigured() {
        when(museScoreCliService.isAvailable()).thenReturn(false);
        assertThatThrownBy(() -> service.requestExport(SCORE_ID, request("MP3", null)))
                .satisfies(e -> assertError(e, ErrorCode.EXPORT_NOT_AVAILABLE));
    }

    @Test
    void rejectsInvalidOptionsAndUnknownScore() {
        assertThatThrownBy(() -> service.requestExport(SCORE_ID, request("MP3", "{\"bitrate\":1}")))
                .satisfies(e -> assertError(e, ErrorCode.EXPORT_OPTION_INVALID));
        when(scoreRepository.findById("none")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.requestExport("none", request("MP3", null)))
                .satisfies(e -> assertError(e, ErrorCode.SCORE_NOT_EXISTED));
    }

    @Test
    void estimatesDuration() {
        Score s = new Score();
        s.setMeasureCount(10);
        s.setTimeSignature("3/4");
        s.setTempoBpm(120);
        // 10 ô x 3 phách ở 120 bpm = 15 giây; ở 50% = 30 giây
        assertThat(ExportServiceImpl.estimateSeconds(s, 100)).isEqualTo(15.0);
        assertThat(ExportServiceImpl.estimateSeconds(s, 50)).isEqualTo(30.0);
        s.setMeasureCount(null);
        assertThat(ExportServiceImpl.estimateSeconds(s, 100)).isZero();
    }

    // ---------------------------------------------------------------- MIDI, MusicXML, SVG

    private ScoreFile svgPage(int page, String sourceTaskId, String path) {
        return ScoreFile.builder()
                .id("svg-" + page)
                .score(score)
                .fileType(FileType.SVG)
                .storagePath(path)
                .pageNumber(page)
                .version(3)
                .isCurrent(true)
                .sourceTaskId(sourceTaskId)
                .meta("{\"sourceVersion\":3,\"options\":{}}")
                .build();
    }

    @Test
    void musicXmlIsReturnedDirectlyWithoutTask() throws Exception {
        when(museScoreCliService.isAvailable()).thenReturn(false); // không cần MuseScore

        ExportResponse response = service.requestExport(SCORE_ID, request("MUSICXML", null));

        assertThat(response.isCached()).isTrue();
        assertThat(response.getFile().getId()).isEqualTo("xml-1");
        verify(aiTaskRepository, never()).save(any());
    }

    @Test
    void midiIsRegeneratedThenReturnedDirectly() throws Exception {
        ScoreFile midi = ScoreFile.builder()
                .id("midi-1")
                .score(score)
                .fileType(FileType.MIDI)
                .storagePath("scores/score-1/midi/v3.mid")
                .version(3)
                .isCurrent(true)
                .build();
        when(scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(SCORE_ID, FileType.MIDI))
                .thenReturn(List.of(midi));

        ExportResponse response = service.requestExport(SCORE_ID, request("MIDI", null));

        verify(scoreContentService).getMidi(SCORE_ID);
        assertThat(response.isCached()).isTrue();
        assertThat(response.getFile().getId()).isEqualTo("midi-1");
        verify(aiTaskRepository, never()).save(any());
    }

    @Test
    void svgCreatesFormatConversionTask() throws Exception {
        ExportResponse response = service.requestExport(SCORE_ID, request("SVG", null));

        assertThat(response.isCached()).isFalse();
        AiTask saved = captureSavedTask();
        assertThat(saved.getTaskType()).isEqualTo(AiTaskType.FORMAT_CONVERSION);
        assertThat(objectMapper
                        .readTree(saved.getInputData())
                        .get("targetFormat")
                        .asText())
                .isEqualTo("SVG");
        assertThat(objectMapper.readTree(saved.getInputData()).get("options").isEmpty())
                .isTrue();
    }

    @Test
    void svgReturnsAllCachedPagesInOrder() throws Exception {
        Path file = Files.writeString(dir.resolve("p.svg"), "<svg/>");
        when(fileStorageService.resolve(anyString())).thenReturn(file);
        when(scoreFileRepository.findByScoreIdAndFileTypeIn(eq(SCORE_ID), anyCollection()))
                .thenReturn(List.of(svgPage(2, "t1", "p2"), svgPage(1, "t1", "p1")));

        ExportResponse response = service.requestExport(SCORE_ID, request("SVG", "{\"page\":2}"));

        assertThat(response.isCached()).isTrue();
        assertThat(response.getFiles()).extracting("pageNumber").containsExactly(1, 2);
        assertThat(response.getFiles()).extracting("taskId").containsOnly("t1");
        assertThat(response.getFile().getId()).isEqualTo("svg-1");
        verify(aiTaskRepository, never()).save(any());
    }

    @Test
    void svgPageBeyondPageCountIsInvalid() throws Exception {
        Path file = Files.writeString(dir.resolve("p.svg"), "<svg/>");
        when(fileStorageService.resolve(anyString())).thenReturn(file);
        when(scoreFileRepository.findByScoreIdAndFileTypeIn(eq(SCORE_ID), anyCollection()))
                .thenReturn(List.of(svgPage(1, "t1", "p1"), svgPage(2, "t1", "p2")));

        assertThatThrownBy(() -> service.requestExport(SCORE_ID, request("SVG", "{\"page\":5}")))
                .satisfies(e -> assertError(e, ErrorCode.EXPORT_OPTION_INVALID));
    }

    @Test
    void svgWithMissingPageFileIsNotCached() throws Exception {
        when(fileStorageService.resolve("p1")).thenReturn(Files.writeString(dir.resolve("p1.svg"), "<svg/>"));
        when(fileStorageService.resolve("p2")).thenReturn(dir.resolve("gone.svg"));
        when(scoreFileRepository.findByScoreIdAndFileTypeIn(eq(SCORE_ID), anyCollection()))
                .thenReturn(List.of(svgPage(1, "t1", "p1"), svgPage(2, "t1", "p2")));

        assertThat(service.requestExport(SCORE_ID, request("SVG", null)).isCached())
                .isFalse();
    }

    @Test
    void zipContainsEveryPageOfTheTask() throws Exception {
        score.setTitle("Bài ca");
        when(fileStorageService.resolve("p1")).thenReturn(Files.writeString(dir.resolve("p1.svg"), "<svg>1</svg>"));
        when(fileStorageService.resolve("p2")).thenReturn(Files.writeString(dir.resolve("p2.svg"), "<svg>2</svg>"));
        when(scoreFileRepository.findByScoreIdAndFileTypeIn(eq(SCORE_ID), anyCollection()))
                .thenReturn(List.of(svgPage(2, "t1", "p2"), svgPage(1, "t1", "p1"), svgPage(1, "other", "x")));

        ExportService.SvgZip zip = service.zipSvgPages(SCORE_ID, "t1");

        assertThat(zip.fileName()).isEqualTo("Bài ca-svg.zip");
        List<String> names = new java.util.ArrayList<>();
        try (java.util.zip.ZipInputStream in =
                new java.util.zip.ZipInputStream(new java.io.ByteArrayInputStream(zip.content()))) {
            java.util.zip.ZipEntry entry;
            while ((entry = in.getNextEntry()) != null) {
                names.add(entry.getName());
            }
        }
        assertThat(names).containsExactly("Bài ca-trang-01.svg", "Bài ca-trang-02.svg");
    }

    @Test
    void zipOfUnknownTaskIs2002() {
        assertThatThrownBy(() -> service.zipSvgPages(SCORE_ID, "none"))
                .satisfies(e -> assertError(e, ErrorCode.FILE_NOT_EXISTED));
    }

    // ---------------------------------------------------------------- MIDI -> MusicXML

    private ScoreFile originalMidi() {
        return ScoreFile.builder()
                .id("mid-1")
                .score(score)
                .fileType(FileType.ORIGINAL_MIDI)
                .storagePath("scores/score-1/original/song.mid")
                .createdAt(LocalDateTime.now())
                .build();
    }

    private void givenOnlyOriginalMidi() {
        when(scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(SCORE_ID, FileType.MUSICXML))
                .thenReturn(List.of());
        when(scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(SCORE_ID, FileType.ORIGINAL_MIDI))
                .thenReturn(List.of(originalMidi()));
    }

    @Test
    void musicXmlRequestWithOnlyMidiCreatesConversionTask() throws Exception {
        givenOnlyOriginalMidi();

        ExportResponse response = service.requestExport(SCORE_ID, request("MUSICXML", null));

        assertThat(response.isCached()).isFalse();
        verify(scoreFileService).checkCanEdit(score);
        AiTask saved = captureSavedTask();
        assertThat(saved.getTaskType()).isEqualTo(AiTaskType.FORMAT_CONVERSION);
        var input = objectMapper.readTree(saved.getInputData());
        assertThat(input.get("targetFormat").asText()).isEqualTo("MUSICXML");
        assertThat(input.get("sourceFileId").asText()).isEqualTo("mid-1");
        assertThat(input.get("sourceVersion").asInt()).isZero();
        verify(eventPublisher).publishEvent(new ExportTaskCreatedEvent("task-1", SCORE_ID));
    }

    @Test
    void requestMidiConversionCreatesTheSameTask() {
        givenOnlyOriginalMidi();

        ExportResponse response = service.requestMidiConversion(SCORE_ID);

        assertThat(response.getTask().getId()).isEqualTo("task-1");
        verify(scoreFileService).checkCanEdit(score);
    }

    @Test
    void midiConversionReturnsRunningTaskInsteadOfDuplicating() {
        givenOnlyOriginalMidi();
        AiTask running = AiTask.builder()
                .id("running-1")
                .taskType(AiTaskType.FORMAT_CONVERSION)
                .status(AiTaskStatus.PROCESSING)
                .inputData("{\"targetFormat\":\"MUSICXML\",\"sourceVersion\":0,\"options\":{}}")
                .build();
        when(aiTaskRepository.findByScoreIdAndTaskTypeInAndStatusIn(eq(SCORE_ID), anyCollection(), anyCollection()))
                .thenReturn(List.of(running));

        assertThat(service.requestMidiConversion(SCORE_ID).getTask().getId()).isEqualTo("running-1");
        verify(aiTaskRepository, never()).save(any());
    }

    @Test
    void conversionIsRefusedWithoutMidiOrWhenMusicXmlExists() throws Exception {
        // Không có MusicXML và không có MIDI gốc
        when(scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(SCORE_ID, FileType.MUSICXML))
                .thenReturn(List.of());
        assertThatThrownBy(() -> service.requestExport(SCORE_ID, request("MUSICXML", null)))
                .satisfies(e -> assertError(e, ErrorCode.EXPORT_SOURCE_NOT_SUPPORTED));

        // Đã có MusicXML thì không chuyển đổi nữa
        when(scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(SCORE_ID, FileType.MUSICXML))
                .thenReturn(List.of(musicXml));
        assertThatThrownBy(() -> service.requestMidiConversion(SCORE_ID))
                .satisfies(e -> assertError(e, ErrorCode.EXPORT_SOURCE_NOT_SUPPORTED));
    }

    @Test
    void conversionNeedsMuseScore() {
        givenOnlyOriginalMidi();
        when(museScoreCliService.isAvailable()).thenReturn(false);
        assertThatThrownBy(() -> service.requestMidiConversion(SCORE_ID))
                .satisfies(e -> assertError(e, ErrorCode.EXPORT_NOT_AVAILABLE));
    }

    // ---------------------------------------------------------------- PDF

    @Test
    void pdfCreatesFormatConversionTaskWithNormalizedOptions() throws Exception {
        ExportResponse response = service.requestExport(SCORE_ID, request("PDF", "{\"pageSize\":\"LETTER\"}"));

        assertThat(response.isCached()).isFalse();
        AiTask saved = captureSavedTask();
        assertThat(saved.getTaskType()).isEqualTo(AiTaskType.FORMAT_CONVERSION);
        var input = objectMapper.readTree(saved.getInputData());
        assertThat(input.get("targetFormat").asText()).isEqualTo("PDF");
        assertThat(input.get("options").get("pageSize").asText()).isEqualTo("LETTER");
        assertThat(input.get("options").get("marginMm").asInt()).isEqualTo(15);
        // PDF không bị giới hạn thời lượng như âm thanh
        score.setMeasureCount(100000);
        assertThat(service.requestExport(SCORE_ID, request("PDF", null)).getTask())
                .isNotNull();
    }

    @Test
    void pdfWithSameOptionsReturnsTheCachedFile() throws Exception {
        Path file = Files.writeString(dir.resolve("a.pdf"), "%PDF-1.4");
        when(fileStorageService.resolve("scores/score-1/export/v3-old.pdf")).thenReturn(file);
        String defaults = "{\"marginMm\":15,\"measureNumbers\":\"SYSTEM\",\"orientation\":\"PORTRAIT\","
                + "\"pageSize\":\"A4\",\"showChords\":true,\"showTitle\":true,\"staffSpaceMm\":1.75}";
        ScoreFile pdf = ScoreFile.builder()
                .id("pdf-1")
                .score(score)
                .fileType(FileType.PDF)
                .storagePath("scores/score-1/export/v3-old.pdf")
                .version(3)
                .isCurrent(true)
                .sourceTaskId("old")
                .meta("{\"sourceVersion\":3,\"options\":" + defaults + "}")
                .build();
        when(scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(SCORE_ID, FileType.PDF))
                .thenReturn(List.of(pdf));

        ExportResponse response = service.requestExport(SCORE_ID, request("PDF", "{\"staffSpaceMm\":1.75}"));

        assertThat(response.isCached()).isTrue();
        assertThat(response.getFile().getId()).isEqualTo("pdf-1");
        verify(aiTaskRepository, never()).save(any());
    }

    @Test
    void pdfWithInvalidOptionsIs2701() {
        assertThatThrownBy(() -> service.requestExport(SCORE_ID, request("PDF", "{\"marginMm\":99}")))
                .satisfies(e -> assertError(e, ErrorCode.EXPORT_OPTION_INVALID));
    }
}
