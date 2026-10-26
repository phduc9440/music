package com.ptit.music_be.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.User;
import com.ptit.music_be.entity.UserScore;

@Repository
public interface UserScoreRepository extends JpaRepository<UserScore, String> {

    List<UserScore> findByUser(User user);

    List<UserScore> findByScore(Score score);

    Optional<UserScore> findByUserAndScore(User user, Score score);
}
