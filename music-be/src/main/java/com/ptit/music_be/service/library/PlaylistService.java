package com.ptit.music_be.service;

import java.util.List;

import com.ptit.music_be.dto.request.PlaylistOrderRequest;
import com.ptit.music_be.dto.request.PlaylistRequest;
import com.ptit.music_be.dto.response.PlaylistItemResponse;
import com.ptit.music_be.dto.response.PlaylistResponse;

public interface PlaylistService {

    /** Playlist của tôi, sắp xếp theo tên. */
    List<PlaylistResponse> getMyPlaylists();

    PlaylistResponse getPlaylist(String id);

    PlaylistResponse create(PlaylistRequest request);

    PlaylistResponse update(String id, PlaylistRequest request);

    /** Xóa playlist (các bài nhạc trong đó không bị xóa). */
    void delete(String id);

    // ---- 3.10: bài trong playlist

    /** Các bài trong playlist theo thứ tự luyện tập. */
    List<PlaylistItemResponse> getItems(String id);

    /** Thêm bài vào cuối playlist (phải xem được bài đó, không trùng). */
    List<PlaylistItemResponse> addScore(String id, String scoreId);

    /** Bỏ bài khỏi playlist (bài nhạc không bị xóa). */
    List<PlaylistItemResponse> removeScore(String id, String scoreId);

    /** Đổi thứ tự: danh sách scoreId phải đúng bằng tập bài hiện có. */
    List<PlaylistItemResponse> reorder(String id, PlaylistOrderRequest request);
}
