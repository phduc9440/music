package com.ptit.music_be.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.User;

@Repository
public interface ScoreRepository extends JpaRepository<Score, String> {

    List<Score> findByUser(User user);

    List<Score> findByVisibility(String visibility);
}
