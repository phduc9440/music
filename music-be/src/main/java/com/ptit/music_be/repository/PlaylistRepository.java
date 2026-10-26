package com.ptit.music_be.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.entity.Playlist;
import com.ptit.music_be.entity.User;

@Repository
public interface PlaylistRepository extends JpaRepository<Playlist, String> {

    List<Playlist> findByUser(User user);
}
