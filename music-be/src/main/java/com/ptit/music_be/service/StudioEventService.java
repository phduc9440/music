package com.ptit.music_be.service;

import com.ptit.music_be.dto.request.StudioEventBatchRequest;
import com.ptit.music_be.dto.response.StudioEventBatchResponse;

public interface StudioEventService {

    StudioEventBatchResponse ingestEvents(String sessionId, StudioEventBatchRequest request);
}
