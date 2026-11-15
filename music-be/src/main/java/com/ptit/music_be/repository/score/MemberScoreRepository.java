package com.ptit.music_be.repository.score;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.MemberScore;
import com.ptit.music_be.entity.Score;

@Repository
public interface MemberScoreRepository extends JpaRepository<MemberScore, String> {

    List<MemberScore> findByMember(Member member);

    List<MemberScore> findByScore(Score score);

    Optional<MemberScore> findByMemberAndScore(Member member, Score score);

    /** Dòng chia sẻ của một người (theo email) với một bản nhạc, nếu có. */
    Optional<MemberScore> findByScoreIdAndMemberEmail(String scoreId, String email);

    Optional<MemberScore> findByScoreIdAndMemberId(String scoreId, String memberId);

    /** Mọi người được chia sẻ một bản nhạc, kèm thông tin thành viên (tránh N+1). */
    @Query("select ms from MemberScore ms join fetch ms.member"
            + " where ms.score.id = :scoreId and ms.permission is not null order by ms.member.email")
    List<MemberScore> findByScoreIdFetchMember(@Param("scoreId") String scoreId);

    /** Các yêu cầu xin quyền đang chờ của một bản nhạc (cũ nhất trước). */
    @Query("select ms from MemberScore ms join fetch ms.member"
            + " where ms.score.id = :scoreId and ms.requestedPermission is not null order by ms.requestedAt asc")
    List<MemberScore> findPendingByScoreIdFetchMember(@Param("scoreId") String scoreId);

    long countByScoreIdAndRequestedPermissionIsNotNull(String scoreId);
}
