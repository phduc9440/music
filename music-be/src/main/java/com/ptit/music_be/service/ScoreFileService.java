package com.ptit.music_be.service;

import java.util.List;

import org.springframework.core.io.Resource;

import com.ptit.music_be.dto.response.ScoreFileResponse;
import com.ptit.music_be.entity.Score;

public interface ScoreFileService {

    List<ScoreFileResponse> getFilesOfScore(String scoreId);

    DownloadableFile loadForDownload(String fileId);

    /** Throws UNAUTHORIZED unless the current member owns the score, is ADMIN, or the score is PUBLIC. */
    void checkCanView(Score score);

    record DownloadableFile(Resource resource, String fileName, String contentType) {}
}
