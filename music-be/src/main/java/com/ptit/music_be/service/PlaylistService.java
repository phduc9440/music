package com.ptit.music_be.service;

import java.util.List;

import com.ptit.music_be.dto.request.PlaylistRequest;
import com.ptit.music_be.dto.response.PlaylistResponse;

public interface PlaylistService {

    /** Playlist của tôi, sắp xếp theo tên. */
    List<PlaylistResponse> getMyPlaylists();

    PlaylistResponse getPlaylist(String id);

    PlaylistResponse create(PlaylistRequest request);

    PlaylistResponse update(String id, PlaylistRequest request);

    /** Xóa playlist (các bài nhạc trong đó không bị xóa). */
    void delete(String id);
}
