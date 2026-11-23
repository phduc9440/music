package com.ptit.music_be.service.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.ArgumentMatchers;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.response.StudioTimelineResponse;
import com.ptit.music_be.dto.response.score.ScoreContent;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.service.score.ScoreContentService;

@ExtendWith(MockitoExtension.class)
class StudioTimelineServiceImplTest {

    @Mock
    JdbcTemplate jdbcTemplate;

    @Mock
    ScoreContentService scoreContentService;

    @Mock
    ScoreRepository scoreRepository;

    final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void refreshesCachedTitleWhenScoreIsRenamed() throws Exception {
        String scoreId = "score-1";
        byte[] musicXml = "<score-partwise/>".getBytes(StandardCharsets.UTF_8);
        StudioTimelineResponse cachedTimeline = new StudioTimelineResponse(
                scoreId, "hash", "Old title", 1, 100, List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
        String cachedJson = objectMapper.writeValueAsString(cachedTimeline);

        when(scoreContentService.getMusicXml(scoreId)).thenReturn(new ScoreContent(musicXml, 1));
        when(scoreRepository.findById(scoreId))
                .thenReturn(Optional.of(
                        Score.builder().id(scoreId).title("New title").build()));
        doAnswer(invocation -> List.of(cachedJson))
                .when(jdbcTemplate)
                .query(anyString(), ArgumentMatchers.<RowMapper<String>>any(), eq(scoreId), anyString());

        StudioTimelineServiceImpl service =
                new StudioTimelineServiceImpl(jdbcTemplate, objectMapper, scoreContentService, scoreRepository);

        StudioTimelineResponse result = service.getTimeline(scoreId);

        assertThat(result.title()).isEqualTo("New title");
        ArgumentCaptor<String> updatedJson = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate)
                .update(
                        eq("UPDATE score_timeline SET timeline = ? WHERE score_id = ? AND content_hash = ?"),
                        updatedJson.capture(),
                        eq(scoreId),
                        anyString());
        assertThat(objectMapper
                        .readValue(updatedJson.getValue(), StudioTimelineResponse.class)
                        .title())
                .isEqualTo("New title");
    }
}
