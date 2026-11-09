package com.ptit.music_be.service.impl;

import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClientException;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ptit.music_be.client.AiServiceClient;
import com.ptit.music_be.dto.enums.FileType;
import com.ptit.music_be.dto.response.ScoreDiffResponse;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.ScoreFileRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.ScoreDiffService;
import com.ptit.music_be.service.ScoreFileService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class ScoreDiffServiceImpl implements ScoreDiffService {

    private static final ObjectMapper JSON = new ObjectMapper();

    private final ScoreRepository scoreRepository;
    private final ScoreFileRepository scoreFileRepository;
    private final ScoreFileService scoreFileService;
    private final AiServiceClient aiServiceClient;

    @Override
    @Transactional
    public ScoreDiffResponse diff(String scoreId, int version, Integer base) {
        Score score =
                scoreRepository.findById(scoreId).orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
        scoreFileService.checkCanView(score);

        List<ScoreFile> files =
                scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(scoreId, FileType.MUSICXML);
        ScoreFile target = find(files, version).orElseThrow(() -> new AppException(ErrorCode.SCORE_VERSION_NOT_EXISTED));
        int baseVersion = base != null ? base : omrVersion(score, files);
        if (baseVersion == version) {
            throw new AppException(ErrorCode.SCORE_DIFF_SAME_VERSION);
        }
        ScoreFile baseFile =
                find(files, baseVersion).orElseThrow(() -> new AppException(ErrorCode.SCORE_VERSION_NOT_EXISTED));

        ObjectNode meta = metaOf(target);
        JsonNode cached = meta.path("diffs").path(String.valueOf(baseVersion));
        if (cached.hasNonNull("summary") && cached.has("measures")) {
            return response(baseVersion, version, cached, true);
        }

        JsonNode result;
        try {
            result = aiServiceClient.diffMusicXml(baseFile.getStoragePath(), target.getStoragePath());
        } catch (HttpClientErrorException.UnprocessableEntity e) {
            log.warn("music-ai không so sánh được {} v{} với v{}: {}", scoreId, version, baseVersion, e.getMessage());
            throw new AppException(ErrorCode.SCORE_DIFF_FAILED);
        } catch (RestClientException e) {
            log.warn("Không gọi được music-ai để so sánh {}: {}", scoreId, e.getMessage());
            throw new AppException(ErrorCode.AI_SERVICE_UNAVAILABLE);
        }
        if (result == null || !result.has("measures") || !result.has("summary")) {
            throw new AppException(ErrorCode.SCORE_DIFF_FAILED);
        }

        ObjectNode diffs = meta.withObject("/diffs");
        diffs.set(String.valueOf(baseVersion), result);
        target.setMeta(meta.toString());
        scoreFileRepository.save(target);
        return response(baseVersion, version, result, false);
    }

    private static ScoreDiffResponse response(int base, int target, JsonNode result, boolean cached) {
        return ScoreDiffResponse.builder()
                .baseVersion(base)
                .targetVersion(target)
                .measures(result.get("measures"))
                .summary(result.get("summary"))
                .cached(cached)
                .build();
    }

    private static Optional<ScoreFile> find(List<ScoreFile> files, int version) {
        return files.stream().filter(f -> versionOf(f) == version).findFirst();
    }

    private static int versionOf(ScoreFile file) {
        return file.getVersion() == null ? 1 : file.getVersion();
    }

    /**
     * Phiên bản do nhận diện sinh ra: bản nhạc có nguồn OMR và là phiên bản nhỏ nhất không do người dùng lưu
     * ({@code savedBy}) hoặc khôi phục ({@code restoredFrom}). Không có thì SCORE_DIFF_NO_BASE.
     */
    private static int omrVersion(Score score, List<ScoreFile> files) {
        if (!"OMR".equals(score.getSourceType())) {
            throw new AppException(ErrorCode.SCORE_DIFF_NO_BASE);
        }
        return files.stream()
                .filter(f -> {
                    ObjectNode meta = metaOf(f);
                    return !meta.has("savedBy") && !meta.hasNonNull("restoredFrom");
                })
                .mapToInt(ScoreDiffServiceImpl::versionOf)
                .min()
                .orElseThrow(() -> new AppException(ErrorCode.SCORE_DIFF_NO_BASE));
    }

    private static ObjectNode metaOf(ScoreFile file) {
        String raw = file.getMeta();
        if (raw != null && !raw.isBlank()) {
            try {
                JsonNode node = JSON.readTree(raw);
                if (node instanceof ObjectNode object) {
                    return object;
                }
            } catch (JsonProcessingException ignored) {
                // meta hỏng thì coi như rỗng, ghi đè khi lưu kết quả so sánh
            }
        }
        return JSON.createObjectNode();
    }
}
