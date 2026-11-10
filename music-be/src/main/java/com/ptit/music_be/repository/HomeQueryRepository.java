package com.ptit.music_be.repository;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import com.ptit.music_be.entity.MemberScore;
import com.ptit.music_be.entity.Score;

/**
 * Các câu đếm và tổng hợp chỉ dùng cho trang chủ (mục 5.3). Tách riêng để không đụng các repository dùng chung. Bản
 * nhạc trong thùng rác tự bị loại nhờ {@code @SQLRestriction} trên {@link Score}; ở các phép join tới Score vẫn ghi rõ
 * {@code deletedAt is null} cho chắc.
 */
public interface HomeQueryRepository extends Repository<Score, String> {

    /** Phần chung của "bản nhạc công khai" trên trang chủ, giống trang Khám phá: bỏ bản sao trong kho mẫu. */
    String PUBLIC_SCORE = "s.visibility = 'PUBLIC' and s.originalScoreId is null";

    @Query("select count(s) from Score s")
    long countScores();

    @Query("select count(s) from Score s where " + PUBLIC_SCORE)
    long countPublicScores();

    /** Số trang bản gốc đã số hóa xong bằng OMR. */
    @Query("select coalesce(sum(s.pageCount), 0) from Score s"
            + " where s.sourceType = 'OMR' and s.processingStatus = 'COMPLETED'")
    long sumDigitizedPages();

    @Query("select coalesce(sum(p.durationSeconds), 0) from PracticeSession p")
    long sumPracticeSeconds();

    @Query("select count(m) from Member m")
    long countMembers();

    /** Yêu cầu xin quyền đang chờ trên các bản của một chủ sở hữu, mới nhất trước, kèm người xin và bản nhạc. */
    @Query("select ms from MemberScore ms join fetch ms.member join fetch ms.score sc"
            + " where sc.member.id = :ownerId and sc.deletedAt is null and ms.requestedPermission is not null"
            + " order by ms.requestedAt desc, ms.id")
    List<MemberScore> pendingAccessRequestsOfOwner(@Param("ownerId") String ownerId, Pageable pageable);

    @Query("select count(ms) from MemberScore ms"
            + " where ms.score.member.id = :ownerId and ms.score.deletedAt is null"
            + " and ms.requestedPermission is not null")
    long countPendingAccessRequestsOfOwner(@Param("ownerId") String ownerId);

    /** Bản của một người đang chờ quản trị viên duyệt công khai. */
    @Query("select count(s) from Score s where s.member.id = :ownerId and s.visibility = 'PENDING'")
    long countPendingPublicOfOwner(@Param("ownerId") String ownerId);

    /** Tổng giây luyện tập của một người từ {@code from}. */
    @Query("select coalesce(sum(p.durationSeconds), 0) from PracticeSession p"
            + " where p.member.id = :memberId and p.startedAt >= :from")
    long sumPracticeSecondsSince(@Param("memberId") String memberId, @Param("from") LocalDateTime from);

    /**
     * Bản nhạc tập gần nhất mà người đó vẫn mở được (bản của mình hoặc bản đang công khai), để gợi ý tập tiếp. Bản đã
     * bị gỡ công khai hoặc vào thùng rác thì bỏ qua.
     */
    @Query("select sc from PracticeSession p join p.score sc"
            + " where p.member.id = :memberId and sc.deletedAt is null"
            + " and (sc.member.id = :memberId or sc.visibility = 'PUBLIC')"
            + " order by p.startedAt desc, p.id")
    List<Score> lastPracticedScores(@Param("memberId") String memberId, Pageable pageable);

    /** Khóa nhạc có trong các bản công khai (cho bộ lọc trang Khám phá). */
    @Query("select distinct s.keySignature from Score s where " + PUBLIC_SCORE
            + " and s.keySignature is not null and s.keySignature <> '' order by s.keySignature")
    List<String> distinctPublicKeys();
}
