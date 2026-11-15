package com.ptit.music_be.service.impl;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.response.ScoreContent;
import com.ptit.music_be.dto.response.StudioTimelineResponse;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.ScoreContentService;
import com.ptit.music_be.service.StudioTimelineService;
import com.ptit.music_be.utils.MusicXmlTimelineParser;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class StudioTimelineServiceImpl implements StudioTimelineService {

    JdbcTemplate jdbcTemplate;
    ObjectMapper objectMapper;
    ScoreContentService scoreContentService;
    ScoreRepository scoreRepository;

    @Override
    @Transactional
    public StudioTimelineResponse getTimeline(String scoreId) {
        ScoreContent content = scoreContentService.getMusicXml(scoreId);
        Score score =
                scoreRepository.findById(scoreId).orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
        String contentHash = sha256(content.bytes());

        List<String> cached = jdbcTemplate.query(
                "SELECT timeline FROM score_timeline WHERE score_id = ? AND content_hash = ?",
                (resultSet, rowNumber) -> resultSet.getString("timeline"),
                scoreId,
                contentHash);
        if (!cached.isEmpty()) {
            StudioTimelineResponse timeline = readCachedTimeline(cached.getFirst());
            if (!Objects.equals(timeline.title(), score.getTitle())) {
                timeline = withTitle(timeline, score.getTitle());
                jdbcTemplate.update(
                        "UPDATE score_timeline SET timeline = ? WHERE score_id = ? AND content_hash = ?",
                        writeTimeline(timeline),
                        scoreId,
                        contentHash);
            }
            return timeline;
        }

        int fallbackTempo = score.getTempoBpm() != null && score.getTempoBpm() > 0 ? score.getTempoBpm() : 100;
        StudioTimelineResponse timeline =
                MusicXmlTimelineParser.parse(scoreId, contentHash, score.getTitle(), fallbackTempo, content.bytes());
        String json = writeTimeline(timeline);
        jdbcTemplate.update(
                """
				INSERT INTO score_timeline (score_id, content_hash, timeline)
				VALUES (?, ?, ?)
				ON DUPLICATE KEY UPDATE
					content_hash = VALUES(content_hash),
					timeline = VALUES(timeline),
					created_at = CURRENT_TIMESTAMP(6)
				""",
                scoreId,
                contentHash,
                json);
        return timeline;
    }

    private StudioTimelineResponse readCachedTimeline(String json) {
        try {
            return objectMapper.readValue(json, StudioTimelineResponse.class);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Cached studio timeline JSON is invalid", exception);
        }
    }

    private String writeTimeline(StudioTimelineResponse timeline) {
        try {
            return objectMapper.writeValueAsString(timeline);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not serialize studio timeline", exception);
        }
    }

    private static StudioTimelineResponse withTitle(StudioTimelineResponse timeline, String title) {
        return new StudioTimelineResponse(
                timeline.scoreId(),
                timeline.contentHash(),
                title,
                timeline.measureCount(),
                timeline.tempoBpm(),
                timeline.timeSignatures(),
                timeline.tempoChanges(),
                timeline.measures(),
                timeline.notes(),
                timeline.steps(),
                timeline.warnings());
    }

    private static String sha256(byte[] content) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available", exception);
        }
    }
}
