package com.ptit.music_be.service;

import java.util.Optional;

import com.ptit.music_be.dto.request.StudioSessionCreateRequest;
import com.ptit.music_be.dto.response.StudioSessionResponse;

public interface StudioSessionService {

    StudioSessionResponse createSession(StudioSessionCreateRequest request);

    Optional<StudioSessionResponse> getActiveSession();

    void abortSession(String sessionId);
}
