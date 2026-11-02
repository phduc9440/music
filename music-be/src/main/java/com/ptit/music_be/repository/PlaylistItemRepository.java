package com.ptit.music_be.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.entity.Playlist;
import com.ptit.music_be.entity.PlaylistItem;
import com.ptit.music_be.entity.Score;

@Repository
public interface PlaylistItemRepository extends JpaRepository<PlaylistItem, String> {

    List<PlaylistItem> findByPlaylistOrderByPositionAsc(Playlist playlist);

    List<PlaylistItem> findByScore(Score score);
}
