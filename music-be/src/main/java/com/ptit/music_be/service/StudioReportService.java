package com.ptit.music_be.service;

import java.util.Optional;

import com.ptit.music_be.dto.enums.StudioMode;
import com.ptit.music_be.dto.request.StudioSessionFinishRequest;
import com.ptit.music_be.dto.response.common.PageResponse;
import com.ptit.music_be.dto.response.StudioSessionReportResponse;
import com.ptit.music_be.dto.response.StudioSessionSummaryResponse;

public interface StudioReportService {

    StudioSessionReportResponse finishSession(String sessionId, StudioSessionFinishRequest request);

    StudioSessionReportResponse getReport(String sessionId);

    PageResponse<StudioSessionSummaryResponse> getSessions(String scoreId, StudioMode mode, int page, int size);

    Optional<StudioSessionReportResponse> getBestSession(String scoreId);
}
