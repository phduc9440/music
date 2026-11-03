package com.ptit.music_be.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.MemberScore;
import com.ptit.music_be.entity.Score;

@Repository
public interface MemberScoreRepository extends JpaRepository<MemberScore, String> {

    List<MemberScore> findByMember(Member member);

    List<MemberScore> findByScore(Score score);

    Optional<MemberScore> findByMemberAndScore(Member member, Score score);
}
