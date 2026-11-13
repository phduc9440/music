package com.ptit.music_be.repository.score;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ptit.music_be.dto.enums.score.SuggestionStatus;
import com.ptit.music_be.entity.ScoreSuggestion;

public interface ScoreSuggestionRepository extends JpaRepository<ScoreSuggestion, String> {

    /** Khóa dòng đề xuất khi nhận/từ chối/rút lại; luôn khóa dòng này trước dòng {@code scores}. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from ScoreSuggestion s where s.id = :id")
    Optional<ScoreSuggestion> findByIdForUpdate(@Param("id") String id);

    /** Đề xuất của một bản nhạc, mới nhất trước; {@code authorId} khác null thì chỉ lấy của người đó. */
    @Query(
            value = "select s from ScoreSuggestion s left join fetch s.author where s.score.id = :scoreId"
                    + " and s.status in :statuses and (:authorId is null or s.author.id = :authorId)"
                    + " order by s.createdAt desc, s.id",
            countQuery = "select count(s) from ScoreSuggestion s where s.score.id = :scoreId"
                    + " and s.status in :statuses and (:authorId is null or s.author.id = :authorId)")
    Page<ScoreSuggestion> findPage(
            @Param("scoreId") String scoreId,
            @Param("statuses") Collection<SuggestionStatus> statuses,
            @Param("authorId") String authorId,
            Pageable pageable);

    /** Số đề xuất đang mở của một người trên một bản nhạc. */
    @Query("select count(s) from ScoreSuggestion s where s.score.id = :scoreId and s.author.id = :authorId"
            + " and s.status = com.ptit.music_be.dto.enums.score.SuggestionStatus.OPEN")
    long countOpenOf(@Param("scoreId") String scoreId, @Param("authorId") String authorId);

    /** Số đề xuất một người đã tạo từ thời điểm {@code since} (trên mọi bản nhạc). */
    @Query("select count(s) from ScoreSuggestion s where s.author.id = :authorId and s.createdAt >= :since")
    long countCreatedSince(@Param("authorId") String authorId, @Param("since") LocalDateTime since);

    /** Đề xuất đã đóng từ trước {@code cutoff} mà file vẫn còn. */
    @Query("select s from ScoreSuggestion s where s.status in :closed and s.storagePath is not null"
            + " and s.decidedAt < :cutoff")
    List<ScoreSuggestion> findClosedWithFileBefore(
            @Param("closed") Collection<SuggestionStatus> closed, @Param("cutoff") LocalDateTime cutoff);
}
