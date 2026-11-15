package com.ptit.music_be.service;

import com.ptit.music_be.dto.response.StudioTimelineResponse;

public interface StudioTimelineService {

    StudioTimelineResponse getTimeline(String scoreId);
}
