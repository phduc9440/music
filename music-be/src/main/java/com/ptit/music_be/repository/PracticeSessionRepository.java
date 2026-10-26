package com.ptit.music_be.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.entity.PracticeSession;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.User;

@Repository
public interface PracticeSessionRepository extends JpaRepository<PracticeSession, String> {

    List<PracticeSession> findByUser(User user);

    List<PracticeSession> findByUserAndScore(User user, Score score);
}
