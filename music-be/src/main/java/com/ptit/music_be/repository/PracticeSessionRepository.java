package com.ptit.music_be.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.PracticeSession;
import com.ptit.music_be.entity.Score;

@Repository
public interface PracticeSessionRepository extends JpaRepository<PracticeSession, String> {

    List<PracticeSession> findByMember(Member member);

    List<PracticeSession> findByMemberAndScore(Member member, Score score);
}
