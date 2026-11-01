package com.ptit.music_be.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Playlist;

@Repository
public interface PlaylistRepository extends JpaRepository<Playlist, String> {

    List<Playlist> findByMember(Member member);
}
