package com.ptit.music_be.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;

@Repository
public interface ScoreRepository extends JpaRepository<Score, String> {

    List<Score> findByMember(Member member);

    List<Score> findByVisibility(String visibility);
}
