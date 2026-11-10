package com.ptit.music_be.service.score.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.client.AiServiceClient;
import com.ptit.music_be.dto.enums.FileType;
import com.ptit.music_be.dto.response.ScoreDiffResponse;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.ScoreFileRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.score.ScoreFileService;

@ExtendWith(MockitoExtension.class)
class ScoreDiffServiceImplTest {

    static final String SCORE_ID = "score-1";
    static final ObjectMapper JSON = new ObjectMapper();

    @Mock
    ScoreRepository scoreRepository;

    @Mock
    ScoreFileRepository scoreFileRepository;

    @Mock
    ScoreFileService scoreFileService;

    @Mock
    AiServiceClient aiServiceClient;

    ScoreDiffServiceImpl service;
    Score score;

    @BeforeEach
    void setUp() {
        service = new ScoreDiffServiceImpl(scoreRepository, scoreFileRepository, scoreFileService, aiServiceClient);
        score = Score.builder().id(SCORE_ID).sourceType("OMR").build();
        lenient().when(scoreRepository.findById(SCORE_ID)).thenReturn(Optional.of(score));
    }

    private static ScoreFile xml(int version, String meta) {
        return ScoreFile.builder()
                .fileType(FileType.MUSICXML)
                .version(version)
                .storagePath("scores/%s/musicxml/v%d.musicxml".formatted(SCORE_ID, version))
                .meta(meta)
                .build();
    }

    private void givenFiles(ScoreFile... files) {
        when(scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(SCORE_ID, FileType.MUSICXML))
                .thenReturn(List.of(files));
    }

    private static JsonNode diffResult() throws Exception {
        return JSON.readTree("{\"measures\":[{\"base\":1,\"target\":1,\"status\":\"same\",\"errors\":[]}],"
                + "\"summary\":{\"measureEditRate\":0.0}}");
    }

    @Test
    void comparesWithOmrVersionAndCachesResult() throws Exception {
        // v1 do OMR sinh, v2 do người dùng lưu, v3 khôi phục từ v1: bản gốc mặc định là v1
        givenFiles(xml(1, null), xml(2, "{\"savedBy\":\"a@b.c\"}"), xml(3, "{\"restoredFrom\":1}"));
        when(aiServiceClient.diffMusicXml(anyString(), anyString())).thenReturn(diffResult());

        ScoreDiffResponse response = service.diff(SCORE_ID, 2, null);

        assertThat(response.getBaseVersion()).isEqualTo(1);
        assertThat(response.getTargetVersion()).isEqualTo(2);
        assertThat(response.isCached()).isFalse();
        verify(aiServiceClient)
                .diffMusicXml("scores/score-1/musicxml/v1.musicxml", "scores/score-1/musicxml/v2.musicxml");
        ArgumentCaptor<ScoreFile> saved = ArgumentCaptor.forClass(ScoreFile.class);
        verify(scoreFileRepository).save(saved.capture());
        JsonNode meta = JSON.readTree(saved.getValue().getMeta());
        assertThat(meta.path("savedBy").asText()).isEqualTo("a@b.c"); // meta cũ được giữ
        assertThat(meta.path("diffs")
                        .path("1")
                        .path("summary")
                        .path("measureEditRate")
                        .asDouble())
                .isZero();
    }

    @Test
    void returnsStoredDiffWithoutCallingMusicAi() throws Exception {
        String meta = "{\"diffs\":{\"1\":" + diffResult() + "}}";
        givenFiles(xml(1, null), xml(2, meta));

        ScoreDiffResponse response = service.diff(SCORE_ID, 2, 1);

        assertThat(response.isCached()).isTrue();
        verify(aiServiceClient, never()).diffMusicXml(any(), any());
        verify(scoreFileRepository, never()).save(any());
    }

    @Test
    void rejectsSameVersion() {
        givenFiles(xml(1, null), xml(2, null));
        AppException error = (AppException) catchThrowable(() -> service.diff(SCORE_ID, 1, null));
        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.SCORE_DIFF_SAME_VERSION);
    }

    @Test
    void scoreNotFromOmrHasNoDefaultBase() {
        score.setSourceType("IMPORT");
        givenFiles(xml(1, null), xml(2, "{\"savedBy\":\"a@b.c\"}"));
        AppException error = (AppException) catchThrowable(() -> service.diff(SCORE_ID, 2, null));
        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.SCORE_DIFF_NO_BASE);
    }

    @Test
    void missingVersionIsReported() {
        givenFiles(xml(1, null));
        AppException error = (AppException) catchThrowable(() -> service.diff(SCORE_ID, 5, 1));
        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.SCORE_VERSION_NOT_EXISTED);
    }
}
