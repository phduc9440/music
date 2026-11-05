package com.ptit.music_be.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.dto.enums.SharePermission;
import com.ptit.music_be.dto.enums.ShareSource;

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

    /** Thu hồi mọi quyền cấp qua liên kết (khi chủ tắt hoặc tạo lại liên kết). */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("delete from MemberScore ms where ms.score.id = :scoreId and ms.source = :source")
    int deleteByScoreIdAndSource(@Param("scoreId") String scoreId, @Param("source") ShareSource source);

    /** Đổi cấp của mọi quyền cấp qua liên kết (khi chủ đổi cấp của liên kết). */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update MemberScore ms set ms.permission = :permission"
            + " where ms.score.id = :scoreId and ms.source = :source")
    int updatePermissionByScoreIdAndSource(
            @Param("scoreId") String scoreId,
            @Param("source") ShareSource source,
            @Param("permission") SharePermission permission);
}
