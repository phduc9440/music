package com.ptit.music_be.repository.report;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ptit.music_be.dto.enums.report.ReportStatus;
import com.ptit.music_be.entity.ContentReport;

public interface ContentReportRepository extends JpaRepository<ContentReport, String> {

    boolean existsByReporterIdAndScoreIdAndStatus(String reporterId, String scoreId, ReportStatus status);

    boolean existsByReporterIdAndCommentIdAndStatus(String reporterId, String commentId, ReportStatus status);

    boolean existsByReporterIdAndForumThreadIdAndStatus(String reporterId, String threadId, ReportStatus status);

    boolean existsByReporterIdAndForumPostIdAndStatus(String reporterId, String postId, ReportStatus status);

    long countByReporterIdAndCreatedAtAfter(String reporterId, LocalDateTime after);

    long countByStatus(ReportStatus status);

    /** Báo cáo đang chờ của cùng một bản nhạc: xử lý một cái thì đóng hết các cái còn lại. */
    @Query("select r from ContentReport r where r.status = 'PENDING' and r.score.id = :scoreId")
    List<ContentReport> findPendingOfScore(@Param("scoreId") String scoreId);

    @Query("select r from ContentReport r where r.status = 'PENDING' and r.comment.id = :commentId")
    List<ContentReport> findPendingOfComment(@Param("commentId") String commentId);

    /** Báo cáo chờ của chính chủ đề (báo cáo bài trả lời trong chủ đề đó là đối tượng khác). */
    @Query("select r from ContentReport r where r.status = 'PENDING' and r.targetType = 'FORUM_THREAD'"
            + " and r.forumThread.id = :threadId")
    List<ContentReport> findPendingOfForumThread(@Param("threadId") String threadId);

    @Query("select r from ContentReport r where r.status = 'PENDING' and r.targetType = 'FORUM_POST'"
            + " and r.forumPost.id = :postId")
    List<ContentReport> findPendingOfForumPost(@Param("postId") String postId);

    /** Số báo cáo đang chờ trên cùng một đối tượng, để hàng chờ hiện "n người báo cáo". */
    @Query("select count(r) from ContentReport r where r.status = 'PENDING' and r.score.id = :scoreId")
    long countPendingOfScore(@Param("scoreId") String scoreId);

    @Query("select count(r) from ContentReport r where r.status = 'PENDING' and r.comment.id = :commentId")
    long countPendingOfComment(@Param("commentId") String commentId);

    /**
     * Thông tin đối tượng bị báo cáo tra từ bảng gốc (SQL thuần để thấy cả bản đã vào thùng rác): tên, chủ, còn hiển thị
     * hay không. Không có dòng nào nghĩa là đã bị xóa hẳn.
     */
    @Query(
            nativeQuery = true,
            value = "SELECT s.title AS label, s.member_id AS ownerId, m.email AS ownerEmail, m.full_name AS ownerName,"
                    + " CASE WHEN s.deleted_at IS NULL THEN 1 ELSE 0 END AS available"
                    + " FROM scores s LEFT JOIN members m ON m.id = s.member_id WHERE s.id = :id")
    Optional<TargetInfo> findScoreInfo(@Param("id") String id);

    @Query(
            nativeQuery = true,
            value = "SELECT LEFT(c.content, 100) AS label, c.author_id AS ownerId, m.email AS ownerEmail,"
                    + " m.full_name AS ownerName, CASE WHEN c.hidden_at IS NULL THEN 1 ELSE 0 END AS available"
                    + " FROM score_comments c LEFT JOIN members m ON m.id = c.author_id WHERE c.id = :id")
    Optional<TargetInfo> findCommentInfo(@Param("id") String id);

    @Query(
            nativeQuery = true,
            value = "SELECT t.title AS label, t.author_id AS ownerId, m.email AS ownerEmail, m.full_name AS ownerName,"
                    + " CASE WHEN t.hidden_at IS NULL THEN 1 ELSE 0 END AS available"
                    + " FROM forum_threads t LEFT JOIN members m ON m.id = t.author_id WHERE t.id = :id")
    Optional<TargetInfo> findForumThreadInfo(@Param("id") String id);

    /** Bài trả lời chỉ còn hiển thị khi cả bài và chủ đề chứa nó đều chưa bị ẩn. */
    @Query(
            nativeQuery = true,
            value = "SELECT LEFT(p.body, 100) AS label, p.author_id AS ownerId, m.email AS ownerEmail,"
                    + " m.full_name AS ownerName,"
                    + " CASE WHEN p.hidden_at IS NULL AND t.hidden_at IS NULL THEN 1 ELSE 0 END AS available"
                    + " FROM forum_posts p JOIN forum_threads t ON t.id = p.thread_id"
                    + " LEFT JOIN members m ON m.id = p.author_id WHERE p.id = :id")
    Optional<TargetInfo> findForumPostInfo(@Param("id") String id);

    /** Kết quả tra cứu đối tượng bị báo cáo; available = 1 khi bản nhạc / góp ý còn hiển thị. */
    interface TargetInfo {
        String getLabel();

        String getOwnerId();

        String getOwnerEmail();

        String getOwnerName();

        Integer getAvailable();
    }
}
