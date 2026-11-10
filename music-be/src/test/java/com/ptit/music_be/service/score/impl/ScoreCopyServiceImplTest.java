package com.ptit.music_be.service.score.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;

import com.ptit.music_be.dto.enums.DifficultyLevel;
import com.ptit.music_be.dto.enums.FileType;
import com.ptit.music_be.dto.enums.ScoreSource;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.entity.ScoreTag;
import com.ptit.music_be.entity.Tag;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.ScoreFileRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.score.CopyOptions;
import com.ptit.music_be.service.storage.impl.LocalFileStorageService;

class ScoreCopyServiceImplTest {

    private static final String XML = "<score-partwise><part-list/></score-partwise>";

    @TempDir
    Path root;

    private final ScoreRepository scoreRepository = mock(ScoreRepository.class);
    private final ScoreFileRepository scoreFileRepository = mock(ScoreFileRepository.class);
    private ScoreCopyServiceImpl service;
    private Score source;
    private final Member newOwner =
            Member.builder().id("system").email("system@music.com").build();

    @BeforeEach
    void setUp() throws IOException {
        service = new ScoreCopyServiceImpl(
                scoreRepository, scoreFileRepository, new LocalFileStorageService(root.toString()));

        source = Score.builder()
                .id("src")
                .title("Fur Elise")
                .composer("Beethoven")
                .difficulty(DifficultyLevel.MEDIUM)
                .visibility("PUBLIC")
                .isOfficial(true)
                .tempoBpm(120)
                .measureCount(8)
                .keySignature("Am")
                .timeSignature("3/8")
                .staffCount(2)
                .currentVersion(3)
                .build();
        source.getScoreTags()
                .add(ScoreTag.builder()
                        .score(source)
                        .tag(Tag.builder().id("t1").name("Cổ điển").build())
                        .build());
        when(scoreRepository.findById("src")).thenReturn(Optional.of(source));
        when(scoreRepository.save(any(Score.class))).thenAnswer(inv -> {
            Score saved = inv.getArgument(0);
            if (saved.getId() == null) {
                saved.setId("copy1");
            }
            return saved;
        });

        Path dir = root.resolve("scores/src/musicxml");
        Files.createDirectories(dir);
        Files.writeString(dir.resolve("v2.musicxml"), "<old/>", StandardCharsets.UTF_8);
        Files.writeString(dir.resolve("v3.musicxml"), XML, StandardCharsets.UTF_8);
        ScoreFile v2 = xmlFile(2, false, "scores/src/musicxml/v2.musicxml");
        ScoreFile v3 = xmlFile(3, true, "scores/src/musicxml/v3.musicxml");
        when(scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc("src", FileType.MUSICXML))
                .thenReturn(List.of(v2, v3));
    }

    private ScoreFile xmlFile(int version, boolean current, String path) {
        return ScoreFile.builder()
                .fileType(FileType.MUSICXML)
                .version(version)
                .isCurrent(current)
                .storagePath(path)
                .build();
    }

    @Test
    void copiesCurrentMusicXmlAsVersionOneOfAPrivateScore() throws IOException {
        Score copy = service.copy("src", newOwner, new CopyOptions(null, ScoreSource.MANUAL, true, true));

        assertThat(copy.getId()).isEqualTo("copy1");
        assertThat(copy.getMember()).isSameAs(newOwner);
        assertThat(copy.getTitle()).isEqualTo("Fur Elise");
        assertThat(copy.getComposer()).isEqualTo("Beethoven");
        assertThat(copy.getVisibility()).isEqualTo("PRIVATE");
        assertThat(copy.getIsOfficial()).isFalse();
        assertThat(copy.getCurrentVersion()).isEqualTo(1);
        assertThat(copy.getKeySignature()).isEqualTo("Am");
        assertThat(copy.getTimeSignature()).isEqualTo("3/8");
        assertThat(copy.getMeasureCount()).isEqualTo(8);
        assertThat(copy.getScoreTags()).hasSize(1);
        assertThat(Files.readString(root.resolve("scores/copy1/musicxml/v1.musicxml"), StandardCharsets.UTF_8))
                .isEqualTo(XML);

        ArgumentCaptor<ScoreFile> file = ArgumentCaptor.forClass(ScoreFile.class);
        verify(scoreFileRepository, times(1)).save(file.capture());
        assertThat(file.getValue().getFileType()).isEqualTo(FileType.MUSICXML);
        assertThat(file.getValue().getVersion()).isEqualTo(1);
        assertThat(file.getValue().getStoragePath()).isEqualTo("scores/copy1/musicxml/v1.musicxml");
        assertThat(file.getValue().getSizeBytes()).isEqualTo(XML.getBytes(StandardCharsets.UTF_8).length);
    }

    @Test
    void doesNotCarryOverOriginalsOrOtherFiles() {
        service.copy("src", newOwner, CopyOptions.defaults());

        // Chỉ hỏi MUSICXML của bản nguồn; không đọc file gốc, kern, ảnh trang hay file xuất
        verify(scoreFileRepository, never()).findByScoreIdOrderByFileTypeAscPageNumberAsc(any());
        verify(scoreFileRepository, never()).findByScoreIdAndFileTypeIn(any(), any());
        assertThat(root.resolve("scores/copy1").toFile().list()).containsExactly("musicxml");
    }

    @Test
    void optionsOverrideTitleAndDropComposerAndTags() {
        Score copy = service.copy("src", newOwner, new CopyOptions("  Bản của tôi ", ScoreSource.IMPORT, false, false));

        assertThat(copy.getTitle()).isEqualTo("Bản của tôi");
        assertThat(copy.getComposer()).isNull();
        assertThat(copy.getScoreTags()).isEmpty();
        assertThat(copy.getSourceType()).isEqualTo("IMPORT");
    }

    @Test
    void sourceWithoutMusicXmlCannotBeCopied() {
        when(scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc("src", FileType.MUSICXML))
                .thenReturn(List.of());

        assertThatThrownBy(() -> service.copy("src", newOwner, null))
                .isInstanceOfSatisfying(
                        AppException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.MUSICXML_NOT_READY));
        verify(scoreRepository, never()).save(any(Score.class));
    }

    @Test
    void missingSourceScoreFails() {
        assertThatThrownBy(() -> service.copy("nope", newOwner, null))
                .isInstanceOfSatisfying(
                        AppException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.SCORE_NOT_EXISTED));
    }
}
