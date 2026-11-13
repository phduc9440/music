package com.ptit.music_be.service.score.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.InputStream;
import java.util.Optional;
import java.util.function.Consumer;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.dto.enums.score.BlankPreset;
import com.ptit.music_be.dto.enums.score.FileType;
import com.ptit.music_be.dto.enums.score.KeyMode;
import com.ptit.music_be.dto.request.score.BlankScoreRequest;
import com.ptit.music_be.dto.response.score.BlankScoreResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.score.ScoreFileRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.service.storage.FileStorageService;

/** CR-1, CR-3, CR-4: tạo bản trống lưu đúng dòng dữ liệu và file; sai tùy chọn thì không lưu gì. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ScoreCreateServiceImplTest {

    @Mock
    ScoreRepository scoreRepository;

    @Mock
    ScoreFileRepository scoreFileRepository;

    @Mock
    MemberRepository memberRepository;

    @Mock
    FileStorageService fileStorageService;

    ScoreCreateServiceImpl service;

    @BeforeEach
    void setUp() {
        service =
                new ScoreCreateServiceImpl(scoreRepository, scoreFileRepository, memberRepository, fileStorageService);
        Member owner = Member.builder()
                .id("m-1")
                .email("owner@mail.com")
                .fullName("Chủ bản")
                .build();
        when(memberRepository.findByEmail("owner@mail.com")).thenReturn(Optional.of(owner));
        when(scoreRepository.save(any())).thenAnswer(inv -> {
            Score saved = inv.getArgument(0);
            saved.setId("score-1");
            return saved;
        });
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("owner@mail.com", "x", "ROLE_USER"));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private static BlankScoreRequest valid() {
        return BlankScoreRequest.builder()
                .title("  Bản của tôi  ")
                .composer("  ")
                .preset(BlankPreset.PIANO)
                .keyFifths(1)
                .mode(KeyMode.MAJOR)
                .beats(3)
                .beatType(4)
                .tempoBpm(96)
                .measures(16)
                .build();
    }

    private static BlankScoreRequest with(Consumer<BlankScoreRequest> change) {
        BlankScoreRequest request = valid();
        change.accept(request);
        return request;
    }

    private ErrorCode errorOf(BlankScoreRequest request) {
        return catchThrowableOfType(AppException.class, () -> service.createBlank(request))
                .getErrorCode();
    }

    @Test
    void createsAManualPrivateScoreWithMusicXmlVersionOne() {
        BlankScoreResponse response = service.createBlank(valid());

        assertThat(response.getScoreId()).isEqualTo("score-1");
        assertThat(response.getVersion()).isEqualTo(1);

        ArgumentCaptor<Score> score = ArgumentCaptor.forClass(Score.class);
        verify(scoreRepository).save(score.capture());
        Score saved = score.getValue();
        assertThat(saved.getTitle()).isEqualTo("Bản của tôi");
        assertThat(saved.getComposer()).isNull();
        assertThat(saved.getSourceType()).isEqualTo("MANUAL");
        assertThat(saved.getProcessingStatus()).isEqualTo("COMPLETED");
        assertThat(saved.getVisibility()).isEqualTo("PRIVATE");
        assertThat(saved.getCurrentVersion()).isEqualTo(1);
        assertThat(saved.getMeasureCount()).isEqualTo(16);
        assertThat(saved.getKeySignature()).isEqualTo("G");
        assertThat(saved.getTimeSignature()).isEqualTo("3/4");
        assertThat(saved.getTempoBpm()).isEqualTo(96);
        assertThat(saved.getStaffCount()).isEqualTo(2);
        assertThat(saved.getMember().getId()).isEqualTo("m-1");
    }

    @Test
    void writesTheFileAndItsCurrentRow() {
        service.createBlank(valid());

        verify(fileStorageService).store(any(InputStream.class), eq("scores/score-1/musicxml/v1.musicxml"));
        ArgumentCaptor<ScoreFile> file = ArgumentCaptor.forClass(ScoreFile.class);
        verify(scoreFileRepository).save(file.capture());
        ScoreFile row = file.getValue();
        assertThat(row.getFileType()).isEqualTo(FileType.MUSICXML);
        assertThat(row.getVersion()).isEqualTo(1);
        assertThat(row.getIsCurrent()).isTrue();
        assertThat(row.getStoragePath()).isEqualTo("scores/score-1/musicxml/v1.musicxml");
        assertThat(row.getSizeBytes()).isPositive();
        assertThat(row.getMeta())
                .contains("\"savedBy\":\"owner@mail.com\"")
                .contains("\"savedByName\":\"Chủ bản\"")
                .contains("\"measureCount\":16");
    }

    /** CR-3 */
    @Test
    void invalidOptionsAreRejectedWithoutSavingAnything() {
        assertThat(errorOf(with(r -> r.setBeatType(3)))).isEqualTo(ErrorCode.BLANK_SCORE_OPTION_INVALID);
        assertThat(errorOf(with(r -> r.setMeasures(0)))).isEqualTo(ErrorCode.BLANK_SCORE_OPTION_INVALID);
        assertThat(errorOf(with(r -> r.setMeasures(201)))).isEqualTo(ErrorCode.BLANK_SCORE_OPTION_INVALID);
        assertThat(errorOf(with(r -> r.setKeyFifths(8)))).isEqualTo(ErrorCode.BLANK_SCORE_OPTION_INVALID);
        assertThat(errorOf(with(r -> r.setKeyFifths(-8)))).isEqualTo(ErrorCode.BLANK_SCORE_OPTION_INVALID);
        assertThat(errorOf(with(r -> r.setBeats(13)))).isEqualTo(ErrorCode.BLANK_SCORE_OPTION_INVALID);
        assertThat(errorOf(with(r -> r.setBeats(0)))).isEqualTo(ErrorCode.BLANK_SCORE_OPTION_INVALID);
        assertThat(errorOf(with(r -> r.setTempoBpm(19)))).isEqualTo(ErrorCode.BLANK_SCORE_OPTION_INVALID);
        assertThat(errorOf(with(r -> r.setTempoBpm(301)))).isEqualTo(ErrorCode.BLANK_SCORE_OPTION_INVALID);
        assertThat(errorOf(with(r -> r.setPreset(null)))).isEqualTo(ErrorCode.BLANK_SCORE_OPTION_INVALID);
        assertThat(errorOf(with(r -> r.setMode(null)))).isEqualTo(ErrorCode.BLANK_SCORE_OPTION_INVALID);
        assertThat(errorOf(with(r -> r.setBeats(null)))).isEqualTo(ErrorCode.BLANK_SCORE_OPTION_INVALID);
        assertThat(errorOf(null)).isEqualTo(ErrorCode.BLANK_SCORE_OPTION_INVALID);

        verify(scoreRepository, never()).save(any());
        verify(fileStorageService, never()).store(any(), any());
    }

    @Test
    void boundaryOptionsAreAccepted() {
        BlankScoreRequest edge = with(r -> {
            r.setKeyFifths(-7);
            r.setBeats(12);
            r.setBeatType(16);
            r.setTempoBpm(300);
            r.setMeasures(200);
            r.setMode(KeyMode.MINOR);
        });

        assertThat(service.createBlank(edge).getVersion()).isEqualTo(1);
    }

    /** CR-4 */
    @Test
    void blankOrTooLongTitleAndComposerAreRejected() {
        assertThat(errorOf(with(r -> r.setTitle("   ")))).isEqualTo(ErrorCode.SCORE_TITLE_INVALID);
        assertThat(errorOf(with(r -> r.setTitle(null)))).isEqualTo(ErrorCode.SCORE_TITLE_INVALID);
        assertThat(errorOf(with(r -> r.setTitle("x".repeat(256))))).isEqualTo(ErrorCode.SCORE_TITLE_INVALID);
        assertThat(errorOf(with(r -> r.setComposer("x".repeat(256))))).isEqualTo(ErrorCode.SCORE_COMPOSER_INVALID);

        verify(scoreRepository, never()).save(any());
    }

    @Test
    void composerIsKeptWhenGiven() {
        service.createBlank(with(r -> r.setComposer("  Mozart ")));

        ArgumentCaptor<Score> score = ArgumentCaptor.forClass(Score.class);
        verify(scoreRepository).save(score.capture());
        assertThat(score.getValue().getComposer()).isEqualTo("Mozart");
    }
}
