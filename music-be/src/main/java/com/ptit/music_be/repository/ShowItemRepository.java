package com.ptit.music_be.repository;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ptit.music_be.entity.ShowItem;

public interface ShowItemRepository extends JpaRepository<ShowItem, String> {

    @Query("select i from ShowItem i left join fetch i.arranger left join fetch i.reviewer"
            + " where i.show.id = :showId order by i.position, i.createdAt")
    List<ShowItem> findByShowOrdered(@Param("showId") String showId);

    boolean existsByShowIdAndScoreId(String showId, String scoreId);

    /** Người này có được giao phối bản nhạc này trong một show của team không (quyền EDIT qua team). */
    @Query("select count(i) > 0 from ShowItem i where i.scoreId = :scoreId and i.arranger.id = :memberId"
            + " and i.show.team.id = :teamId and i.show.deletedAt is null")
    boolean isArrangerOf(
            @Param("scoreId") String scoreId, @Param("memberId") String memberId, @Param("teamId") String teamId);

    /** Số bài và số bài đã duyệt của từng show. Hàng: [showId, total, approved]. */
    @Query("select i.show.id, count(i), sum(case when i.status = 'APPROVED' then 1 else 0 end) from ShowItem i"
            + " where i.show.id in :showIds group by i.show.id")
    List<Object[]> progressByShows(@Param("showIds") Collection<String> showIds);

    /** Việc của tôi: bài tôi phối hoặc duyệt, chưa xong, thuộc show đang chuẩn bị. */
    @Query("select i from ShowItem i join fetch i.show s join fetch s.team left join fetch i.arranger"
            + " left join fetch i.reviewer where (i.arranger.id = :memberId or i.reviewer.id = :memberId)"
            + " and i.status <> 'APPROVED' and s.status = 'PREPARING' and s.deletedAt is null and s.team.deletedAt is null"
            + " order by case when i.dueDate is null then 1 else 0 end, i.dueDate, s.showDate")
    List<ShowItem> findOpenTasksOf(@Param("memberId") String memberId);

    /** Bài chưa duyệt có hạn đúng ngày này, thuộc show đang chuẩn bị (job nhắc hạn). */
    @Query("select i from ShowItem i join fetch i.show s join fetch s.team left join fetch i.arranger"
            + " left join fetch i.reviewer where i.dueDate = :day and i.status <> 'APPROVED'"
            + " and s.status = 'PREPARING' and s.deletedAt is null and s.team.deletedAt is null")
    List<ShowItem> findDueOn(@Param("day") LocalDate day);

    /** Bỏ người khỏi mọi bài của team khi họ rời/bị xóa khỏi team. */
    @Modifying
    @Query("update ShowItem i set i.arranger = null where i.arranger.id = :memberId and i.show.id in"
            + " (select s.id from Show s where s.team.id = :teamId)")
    int clearArranger(@Param("teamId") String teamId, @Param("memberId") String memberId);

    @Modifying
    @Query("update ShowItem i set i.reviewer = null where i.reviewer.id = :memberId and i.show.id in"
            + " (select s.id from Show s where s.team.id = :teamId)")
    int clearReviewer(@Param("teamId") String teamId, @Param("memberId") String memberId);

    /** Bản nhạc rời team thì rời mọi show của team. */
    @Modifying
    @Query("delete from ShowItem i where i.scoreId = :scoreId and i.show.id in"
            + " (select s.id from Show s where s.team.id = :teamId)")
    int deleteByTeamAndScore(@Param("teamId") String teamId, @Param("scoreId") String scoreId);
}
