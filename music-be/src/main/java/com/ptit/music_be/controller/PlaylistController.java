package com.ptit.music_be.controller;

import java.util.List;

import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.request.PlaylistRequest;
import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.PlaylistResponse;
import com.ptit.music_be.service.PlaylistService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/playlists")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Playlists", description = "Playlist luyện tập của thành viên hiện tại")
public class PlaylistController {

    PlaylistService playlistService;

    @GetMapping
    @Operation(summary = "List my playlists", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<PlaylistResponse>> list() {
        return ApiResponse.<List<PlaylistResponse>>builder()
                .result(playlistService.getMyPlaylists())
                .build();
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get one of my playlists", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PlaylistResponse> get(@PathVariable String id) {
        return ApiResponse.<PlaylistResponse>builder()
                .result(playlistService.getPlaylist(id))
                .build();
    }

    @PostMapping
    @Operation(summary = "Create a playlist", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PlaylistResponse> create(@RequestBody PlaylistRequest request) {
        return ApiResponse.<PlaylistResponse>builder()
                .result(playlistService.create(request))
                .build();
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update name/description of my playlist", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PlaylistResponse> update(@PathVariable String id, @RequestBody PlaylistRequest request) {
        return ApiResponse.<PlaylistResponse>builder()
                .result(playlistService.update(id, request))
                .build();
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete my playlist (scores are kept)", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> delete(@PathVariable String id) {
        playlistService.delete(id);
        return ApiResponse.<Void>builder().build();
    }
}
