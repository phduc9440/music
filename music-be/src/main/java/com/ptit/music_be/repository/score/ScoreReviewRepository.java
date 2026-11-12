package com.ptit.music_be.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.entity.ScoreReview;

@Repository
public interface ScoreReviewRepository extends JpaRepository<ScoreReview, String> {

    /** Nhận xét của một bản nhạc, mới nhất trước, kèm người viết (tránh N+1). */
    @Query("select r from ScoreReview r join fetch r.member where r.score.id = :scoreId order by r.createdAt desc")
    List<ScoreReview> findByScoreIdFetchMember(@Param("scoreId") String scoreId);

    Optional<ScoreReview> findByScoreIdAndMemberId(String scoreId, String memberId);

    /** Điểm trung bình và số lượt chấm sao (chỉ tính nhận xét có số sao). */
    @Query("select avg(r.rating) as average, count(r.rating) as ratingCount from ScoreReview r"
            + " where r.score.id = :scoreId")
    RatingStats getRatingStats(@Param("scoreId") String scoreId);

    /** Điểm trung bình và số lượt chấm của nhiều bản nhạc cùng lúc (bản chưa ai chấm không có dòng). */
    @Query("select r.score.id as scoreId, avg(r.rating) as average, count(r.rating) as ratingCount"
            + " from ScoreReview r where r.score.id in :scoreIds and r.rating is not null group by r.score.id")
    List<ScoreRatingStats> getRatingStatsFor(@Param("scoreIds") java.util.Collection<String> scoreIds);

    interface ScoreRatingStats {
        String getScoreId();

        Double getAverage();

        Long getRatingCount();
    }

    interface RatingStats {
        Double getAverage();

        Long getRatingCount();
    }
}
