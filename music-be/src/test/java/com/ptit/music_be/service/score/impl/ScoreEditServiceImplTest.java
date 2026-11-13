package com.ptit.music_be.service.score.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.ptit.music_be.dto.enums.ai.AiTaskType;
import com.ptit.music_be.dto.enums.score.FileType;
import com.ptit.music_be.dto.response.score.ScoreContent;
import com.ptit.music_be.dto.response.score.ScoreSaveResponse;
import com.ptit.music_be.dto.response.score.ScoreVersionConflict;
import com.ptit.music_be.dto.response.score.ScoreVersionResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.ai.AiTaskRepository;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.score.ScoreFileRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.service.billing.EntitlementService;
import com.ptit.music_be.service.billing.PlanLimits;
import com.ptit.music_be.service.score.ScoreFileService;
import com.ptit.music_be.service.storage.FileStorageService;

@ExtendWith(MockitoExtension.class)
class ScoreEditServiceImplTest {

    static final String SCORE_ID = "score-1";
    static final String XML_TYPE = "application/vnd.recordare.musicxml+xml";
    static final byte[] VALID_XML = ("<?xml version=\"1.0\"?><score-partwise><part-list/><part id=\"P1\">"
                    + "<measure number=\"1\"><attributes><key><fifths>2</fifths></key><time><beats>4</beats>"
                    + "<beat-type>4</beat-type></time></attributes></measure><measure number=\"2\"/></part>"
                    + "</score-partwise>")
            .getBytes(StandardCharsets.UTF_8);

    @Mock
    ScoreRepository scoreRepository;

    @Mock
    ScoreFileRepository scoreFileRepository;

    @Mock
    AiTaskRepository aiTaskRepository;

    @Mock
    ScoreFileService scoreFileService;

    @Mock
    FileStorageService fileStorageService;

    @Mock
    MemberRepository memberRepository;

    @Mock
    EntitlementService entitlementService;

    @TempDir
    Path storage;

    ScoreEditServiceImpl service;
    Score score;

    @BeforeEach
    void setUp() {
        service = new ScoreEditServiceImpl(
                scoreRepository,
                scoreFileRepository,
                aiTaskRepository,
                scoreFileService,
                fileStorageService,
                memberRepository,
                entitlementService,
                new VersionRetention(entitlementService),
                1024 * 1024);
        score = Score.builder().id(SCORE_ID).currentVersion(3).build();
        lenient().when(scoreRepository.findByIdForUpdate(SCORE_ID)).thenReturn(Optional.of(score));
        lenient().when(scoreRepository.findById(SCORE_ID)).thenReturn(Optional.of(score));
        lenient()
                .when(fileStorageService.resolve(any()))
                .thenAnswer(invocation -> storage.resolve((String) invocation.getArgument(0)));
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("owner@mail.com", "x", "ROLE_USER"));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clear();
        }
    }

    /** Tạo các dòng MusicXML version 1..count (tạo cách đây 40 ngày, quá hạn giữ); version cuối cùng là hiện hành. */
    private List<ScoreFile> xmlVersions(int count) {
        return xmlVersions(count, LocalDateTime.now().minusDays(40));
    }

    private List<ScoreFile> xmlVersions(int count, LocalDateTime createdAt) {
        List<ScoreFile> files = new ArrayList<>();
        for (int v = 1; v <= count; v++) {
            files.add(ScoreFile.builder()
                    .fileType(FileType.MUSICXML)
                    .version(v)
                    .createdAt(createdAt)
                    .isCurrent(v == count)
                    .storagePath("scores/%s/musicxml/v%d.musicxml".formatted(SCORE_ID, v))
                    .build());
        }
        return files;
    }

    private void givenXmlVersions(int count) {
        when(scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(SCORE_ID, FileType.MUSICXML))
                .thenReturn(xmlVersions(count));
    }

    private AppException catchError(Runnable action) {
        return (AppException) org.assertj.core.api.Assertions.catchThrowable(action::run);
    }

    @Test
    void saveIncreasesVersionAndUpdatesScore() throws Exception {
        givenXmlVersions(3);

        ScoreSaveResponse response = service.saveMusicXml(SCORE_ID, VALID_XML, XML_TYPE, "\"v3\"", false);

        assertThat(response.getVersion()).isEqualTo(4);
        assertThat(response.getMeasureCount()).isEqualTo(2);
        assertThat(response.getKeySignature()).isEqualTo("D");
        assertThat(response.getTimeSignature()).isEqualTo("4/4");
        assertThat(response.getTempoBpm()).isEqualTo(100);
        assertThat(score.getCurrentVersion()).isEqualTo(4);
        assertThat(score.getMeasureCount()).isEqualTo(2);
        assertThat(Files.readAllBytes(storage.resolve("scores/score-1/musicxml/v4.musicxml")))
                .isEqualTo(VALID_XML);
        assertThat(storage.resolve("scores/score-1/musicxml/v4.musicxml.tmp")).doesNotExist();

        ArgumentCaptor<ScoreFile> created = ArgumentCaptor.forClass(ScoreFile.class);
        verify(scoreFileRepository).save(created.capture());
        assertThat(created.getValue().getVersion()).isEqualTo(4);
        assertThat(created.getValue().getIsCurrent()).isTrue();
        assertThat(created.getValue().getMeta()).contains("owner@mail.com").contains("\"measureCount\":2");
        verify(scoreRepository).save(score);
    }

    @Test
    void oldCurrentFileIsNoLongerCurrent() {
        List<ScoreFile> files = xmlVersions(3);
        when(scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(SCORE_ID, FileType.MUSICXML))
                .thenReturn(files);

        service.saveMusicXml(SCORE_ID, VALID_XML, XML_TYPE, "\"v3\"", false);

        assertThat(files).allSatisfy(f -> assertThat(f.getIsCurrent()).isFalse());
    }

    @Test
    void wrongIfMatchIsConflictWithLatestVersion() {
        givenXmlVersions(3);

        AppException error = catchError(() -> service.saveMusicXml(SCORE_ID, VALID_XML, XML_TYPE, "\"v2\"", false));

        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.SCORE_VERSION_CONFLICT);
        assertThat(error.getPayload()).isEqualTo(new ScoreVersionConflict(3));
        verify(scoreFileRepository, never()).save(any());
        assertThat(storage.resolve("scores/score-1/musicxml/v4.musicxml")).doesNotExist();
    }

    @Test
    void missingOrMalformedIfMatchIsConflict() {
        givenXmlVersions(3);

        assertThat(catchError(() -> service.saveMusicXml(SCORE_ID, VALID_XML, XML_TYPE, null, false))
                        .getErrorCode())
                .isEqualTo(ErrorCode.SCORE_VERSION_CONFLICT);
        assertThat(catchError(() -> service.saveMusicXml(SCORE_ID, VALID_XML, XML_TYPE, "3", false))
                        .getErrorCode())
                .isEqualTo(ErrorCode.SCORE_VERSION_CONFLICT);
    }

    @Test
    void forceByOwnerOverridesVersion() {
        givenXmlVersions(3);
        when(scoreFileService.canManageSharing(score)).thenReturn(true);

        ScoreSaveResponse response = service.saveMusicXml(SCORE_ID, VALID_XML, XML_TYPE, "\"v1\"", true);

        assertThat(response.getVersion()).isEqualTo(4);
    }

    @Test
    void forceByNonOwnerIsUnauthorized() {
        givenXmlVersions(3);
        when(scoreFileService.canManageSharing(score)).thenReturn(false);

        AppException error = catchError(() -> service.saveMusicXml(SCORE_ID, VALID_XML, XML_TYPE, "\"v1\"", true));

        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.UNAUTHORIZED);
        verify(scoreFileRepository, never()).save(any());
    }

    @Test
    void cannotEditIsUnauthorized() {
        doThrow(new AppException(ErrorCode.UNAUTHORIZED)).when(scoreFileService).checkCanEdit(score);

        AppException error = catchError(() -> service.saveMusicXml(SCORE_ID, VALID_XML, XML_TYPE, "\"v3\"", false));

        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.UNAUTHORIZED);
    }

    @Test
    void missingScoreIsNotFound() {
        when(scoreRepository.findByIdForUpdate("nope")).thenReturn(Optional.empty());

        AppException error = catchError(() -> service.saveMusicXml("nope", VALID_XML, XML_TYPE, "\"v3\"", false));

        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.SCORE_NOT_EXISTED);
    }

    @Test
    void activeOmrTaskIsBusy() {
        when(aiTaskRepository.existsByScoreIdAndTaskTypeAndStatusIn(
                        eq(SCORE_ID), eq(AiTaskType.OMR_CONVERSION), anyCollection()))
                .thenReturn(true);

        AppException error = catchError(() -> service.saveMusicXml(SCORE_ID, VALID_XML, XML_TYPE, "\"v3\"", false));

        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.SCORE_BUSY);
    }

    @Test
    void emptyOrOversizedBodyIsTooLarge() {
        assertThat(catchError(() -> service.saveMusicXml(SCORE_ID, new byte[0], XML_TYPE, "\"v3\"", false))
                        .getErrorCode())
                .isEqualTo(ErrorCode.FILE_TOO_LARGE);
        assertThat(catchError(() ->
                                service.saveMusicXml(SCORE_ID, new byte[1024 * 1024 + 1], XML_TYPE, "\"v3\"", false))
                        .getErrorCode())
                .isEqualTo(ErrorCode.FILE_TOO_LARGE);
    }

    @Test
    void nonXmlContentTypeIsInvalid() {
        assertThat(catchError(() -> service.saveMusicXml(SCORE_ID, VALID_XML, "application/json", "\"v3\"", false))
                        .getErrorCode())
                .isEqualTo(ErrorCode.MUSICXML_INVALID);
        assertThat(catchError(() -> service.saveMusicXml(SCORE_ID, VALID_XML, null, "\"v3\"", false))
                        .getErrorCode())
                .isEqualTo(ErrorCode.MUSICXML_INVALID);
    }

    @Test
    void contentTypeWithCharsetIsAccepted() {
        givenXmlVersions(3);

        ScoreSaveResponse response =
                service.saveMusicXml(SCORE_ID, VALID_XML, "text/xml; charset=UTF-8", "\"v3\"", false);

        assertThat(response.getVersion()).isEqualTo(4);
    }

    @Test
    void invalidXmlIsRejectedBeforeVersionCheck() {
        givenXmlVersions(3);

        AppException error = catchError(() -> service.saveMusicXml(
                SCORE_ID, "<score-partwise>".getBytes(StandardCharsets.UTF_8), XML_TYPE, "\"v1\"", false));

        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.MUSICXML_INVALID);
    }

    @Test
    void missingMusicXmlIsNotReady() {
        when(scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(SCORE_ID, FileType.MUSICXML))
                .thenReturn(List.of());

        AppException error = catchError(() -> service.saveMusicXml(SCORE_ID, VALID_XML, XML_TYPE, "\"v0\"", false));

        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.MUSICXML_NOT_READY);
    }

    @Test
    void keepsOnlyTwentyNewestVersions() {
        score.setCurrentVersion(20);
        givenXmlVersions(20);
        when(scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(SCORE_ID, FileType.MIDI))
                .thenReturn(List.of(
                        ScoreFile.builder()
                                .fileType(FileType.MIDI)
                                .version(1)
                                .storagePath("scores/score-1/midi/v1.mid")
                                .build(),
                        ScoreFile.builder()
                                .fileType(FileType.MIDI)
                                .version(20)
                                .storagePath("scores/score-1/midi/v20.mid")
                                .build()));
        TransactionSynchronizationManager.initSynchronization();

        service.saveMusicXml(SCORE_ID, VALID_XML, XML_TYPE, "\"v20\"", false);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ScoreFile>> deleted = ArgumentCaptor.forClass(List.class);
        verify(scoreFileRepository).deleteAll(deleted.capture());
        assertThat(deleted.getValue())
                .extracting(ScoreFile::getStoragePath)
                .containsExactlyInAnyOrder("scores/score-1/musicxml/v1.musicxml", "scores/score-1/midi/v1.mid");

        // File chỉ bị xóa sau khi commit
        verify(fileStorageService, never()).delete(any());
        runCompletion(TransactionSynchronization.STATUS_COMMITTED);
        verify(fileStorageService).delete("scores/score-1/musicxml/v1.musicxml");
        verify(fileStorageService).delete("scores/score-1/midi/v1.mid");
        verify(fileStorageService, never()).delete("scores/score-1/musicxml/v21.musicxml");
    }

    @Test
    void doesNotPruneWhileUnderTheLimit() {
        score.setCurrentVersion(19);
        givenXmlVersions(19);

        service.saveMusicXml(SCORE_ID, VALID_XML, XML_TYPE, "\"v19\"", false);

        verify(scoreFileRepository, never()).deleteAll(anyCollection());
    }

    @Test
    void rollbackDeletesTheNewFile() {
        givenXmlVersions(3);
        TransactionSynchronizationManager.initSynchronization();

        service.saveMusicXml(SCORE_ID, VALID_XML, XML_TYPE, "\"v3\"", false);
        runCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);

        verify(fileStorageService).delete("scores/score-1/musicxml/v4.musicxml");
    }

    @Test
    void parseIfMatchAcceptsQuotedAndWeakForms() {
        assertThat(ScoreEditServiceImpl.parseIfMatch("\"v5\"")).isEqualTo(5);
        assertThat(ScoreEditServiceImpl.parseIfMatch("v5")).isEqualTo(5);
        assertThat(ScoreEditServiceImpl.parseIfMatch("W/\"v5\"")).isEqualTo(5);
        assertThat(ScoreEditServiceImpl.parseIfMatch("\"5\"")).isNull();
        assertThat(ScoreEditServiceImpl.parseIfMatch("*")).isNull();
    }

    private void runCompletion(int status) {
        for (TransactionSynchronization sync : TransactionSynchronizationManager.getSynchronizations()) {
            sync.afterCompletion(status);
        }
    }

    // ---------------------------------------------------------------- lịch sử phiên bản

    @Test
    void listVersionsReturnsNewestFirstWithSourceAndCurrent() {
        score.setSourceType("OMR");
        List<ScoreFile> files = xmlVersions(5);
        files.get(3).setMeta("{\"savedBy\":\"a@mail.com\",\"savedByName\":\"An\",\"restoredFrom\":2}");
        files.get(4).setMeta("{\"savedBy\":\"a@mail.com\",\"savedByName\":\"An\",\"measureCount\":12}");
        when(scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(SCORE_ID, FileType.MUSICXML))
                .thenReturn(files);

        List<ScoreVersionResponse> versions = service.listVersions(SCORE_ID);

        assertThat(versions).extracting(ScoreVersionResponse::getVersion).containsExactly(5, 4, 3, 2, 1);
        assertThat(versions)
                .extracting(ScoreVersionResponse::getIsCurrent)
                .containsExactly(true, false, false, false, false);
        assertThat(versions.get(0).getSource()).isEqualTo("EDITOR");
        assertThat(versions.get(0).getSavedByName()).isEqualTo("An");
        assertThat(versions.get(0).getMeasureCount()).isEqualTo(12);
        assertThat(versions.get(1).getSource()).isEqualTo("RESTORE");
        assertThat(versions.get(1).getRestoredFrom()).isEqualTo(2);
        assertThat(versions.get(4).getSource()).isEqualTo("OMR");
        assertThat(versions.get(4).getSavedByName()).isNull();
    }

    /** Gói của chủ bản nhạc giữ {@code keptVersions} version (null = không giới hạn). */
    private void givenOwnerPlanKeeps(Integer keptVersions) {
        score.setMember(Member.builder().id("owner-1").build());
        lenient()
                .when(entitlementService.limitsOf("owner-1"))
                .thenReturn(new PlanLimits(null, null, null, keptVersions, null, null, null, null, null));
    }

    @Test
    void listVersionsShowsOnlyTheVersionsTheOwnersPlanKeeps() {
        givenOwnerPlanKeeps(5);
        givenXmlVersions(8);

        List<ScoreVersionResponse> versions = service.listVersions(SCORE_ID);

        assertThat(versions).extracting(ScoreVersionResponse::getVersion).containsExactly(8, 7, 6, 5, 4);
    }

    @Test
    void upgradingThePlanBringsOlderVersionsBack() {
        givenOwnerPlanKeeps(20);
        givenXmlVersions(8);

        assertThat(service.listVersions(SCORE_ID)).hasSize(8);
    }

    @Test
    void unlimitedPlanAndOwnerlessScoresShowEveryVersion() {
        givenXmlVersions(25);
        assertThat(service.listVersions(SCORE_ID)).hasSize(25);

        givenOwnerPlanKeeps(null);
        assertThat(service.listVersions(SCORE_ID)).hasSize(25);
    }

    @Test
    void hiddenVersionCannotBeOpenedOrRestored() {
        givenOwnerPlanKeeps(5);
        score.setCurrentVersion(8);
        givenXmlVersions(8);

        assertThat(catchError(() -> service.getVersionContent(SCORE_ID, 3)).getErrorCode())
                .isEqualTo(ErrorCode.SCORE_VERSION_NOT_EXISTED);
        assertThat(catchError(() -> service.restoreVersion(SCORE_ID, 3, "\"v8\""))
                        .getErrorCode())
                .isEqualTo(ErrorCode.SCORE_VERSION_NOT_EXISTED);
        verify(scoreFileRepository, never()).save(any());
    }

    @Test
    void hiddenButStoredVersionsAreNotDeletedWhileFreshOrWithinTheStoredFloor() {
        givenOwnerPlanKeeps(5);
        score.setCurrentVersion(25);
        // Gói chỉ cho xem 5 nhưng đĩa giữ tối thiểu 20 version; 25 version mới tạo hôm nay thì chưa xóa gì
        when(scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(SCORE_ID, FileType.MUSICXML))
                .thenReturn(xmlVersions(25, LocalDateTime.now()));

        service.saveMusicXml(SCORE_ID, VALID_XML, XML_TYPE, "\"v25\"", false);

        verify(scoreFileRepository, never()).deleteAll(anyCollection());
    }

    @Test
    void storageIsCheckedAgainstTheOwnersPlanBeforeWriting() {
        givenOwnerPlanKeeps(5);
        doThrow(new AppException(ErrorCode.PLAN_LIMIT_REACHED))
                .when(entitlementService)
                .checkStorage("owner-1", VALID_XML.length);

        AppException error = catchError(() -> service.saveMusicXml(SCORE_ID, VALID_XML, XML_TYPE, "\"v3\"", false));

        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.PLAN_LIMIT_REACHED);
        assertThat(storage.resolve("scores/score-1/musicxml/v4.musicxml")).doesNotExist();
        verify(scoreFileRepository, never()).save(any());
    }

    @Test
    void getVersionContentReturnsOldBytes() throws Exception {
        givenXmlVersions(5);
        writeVersionFile(2, VALID_XML);

        ScoreContent content = service.getVersionContent(SCORE_ID, 2);

        assertThat(content.version()).isEqualTo(2);
        assertThat(content.bytes()).isEqualTo(VALID_XML);
    }

    @Test
    void getVersionContentOfMissingVersionIs2801() {
        givenXmlVersions(5);

        assertThat(catchError(() -> service.getVersionContent(SCORE_ID, 9)).getErrorCode())
                .isEqualTo(ErrorCode.SCORE_VERSION_NOT_EXISTED);
    }

    @Test
    void getVersionContentWhenFileIsGoneIs2002() {
        givenXmlVersions(5);

        assertThat(catchError(() -> service.getVersionContent(SCORE_ID, 2)).getErrorCode())
                .isEqualTo(ErrorCode.FILE_NOT_EXISTED);
    }

    @Test
    void restoreSavesOldContentAsNextVersion() throws Exception {
        score.setCurrentVersion(5);
        givenXmlVersions(5);
        writeVersionFile(2, VALID_XML);

        ScoreSaveResponse response = service.restoreVersion(SCORE_ID, 2, "\"v5\"");

        assertThat(response.getVersion()).isEqualTo(6);
        assertThat(score.getCurrentVersion()).isEqualTo(6);
        assertThat(Files.readAllBytes(storage.resolve("scores/score-1/musicxml/v6.musicxml")))
                .isEqualTo(VALID_XML);
        ArgumentCaptor<ScoreFile> created = ArgumentCaptor.forClass(ScoreFile.class);
        verify(scoreFileRepository).save(created.capture());
        assertThat(created.getValue().getVersion()).isEqualTo(6);
        assertThat(created.getValue().getMeta()).contains("\"restoredFrom\":2").contains("owner@mail.com");
    }

    @Test
    void restoreWithStaleIfMatchIsConflict() throws Exception {
        score.setCurrentVersion(5);
        givenXmlVersions(5);
        writeVersionFile(2, VALID_XML);

        AppException error = catchError(() -> service.restoreVersion(SCORE_ID, 2, "\"v4\""));

        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.SCORE_VERSION_CONFLICT);
        verify(scoreFileRepository, never()).save(any());
    }

    @Test
    void restoreOfDeletedVersionIs2801() {
        score.setCurrentVersion(5);
        givenXmlVersions(5);

        assertThat(catchError(() -> service.restoreVersion(SCORE_ID, 9, "\"v5\""))
                        .getErrorCode())
                .isEqualTo(ErrorCode.SCORE_VERSION_NOT_EXISTED);
        verify(scoreFileRepository, never()).save(any());
    }

    private void writeVersionFile(int version, byte[] content) throws Exception {
        Path file = storage.resolve("scores/score-1/musicxml/v%d.musicxml".formatted(version));
        Files.createDirectories(file.getParent());
        Files.write(file, content);
    }
}
