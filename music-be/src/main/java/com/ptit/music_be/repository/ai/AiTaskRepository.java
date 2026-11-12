package com.ptit.music_be.repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.dto.enums.AiTaskStatus;
import com.ptit.music_be.dto.enums.AiTaskType;
import com.ptit.music_be.entity.AiTask;

@Repository
public interface AiTaskRepository extends JpaRepository<AiTask, String> {

    /**
     * Số trang OMR một người đã dùng trong khoảng [from, to): tổng {@code input_data.pagesCharged} của các task OMR chưa lỗi
     * hoặc bị hủy. Tính từ dữ liệu gốc, không lưu bộ đếm riêng (task lỗi/hủy tự không được tính).
     */
    @Query(
            value = "SELECT COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(t.input_data, '$.pagesCharged')) AS UNSIGNED)), 0)"
                    + " FROM ai_tasks t WHERE t.member_id = :memberId AND t.task_type = 'OMR_CONVERSION'"
                    + " AND t.status NOT IN ('FAILED', 'CANCELLED') AND t.created_at >= :from AND t.created_at < :to",
            nativeQuery = true)
    long sumOmrPagesCharged(
            @Param("memberId") String memberId,
            @Param("from") java.time.LocalDateTime from,
            @Param("to") java.time.LocalDateTime to);

    List<AiTask> findByScoreIdOrderByCreatedAtDesc(String scoreId);

    List<AiTask> findByStatusOrderByCreatedAtAsc(AiTaskStatus status);

    /** Dùng để chặn xóa/sửa bản nhạc khi còn tác vụ đang chạy. */
    boolean existsByScoreIdAndStatusIn(String scoreId, Collection<AiTaskStatus> statuses);

    /** Đếm số tác vụ một loại của người dùng đang ở các trạng thái cho trước (giới hạn 3 task OMR chạy cùng lúc). */
    long countByMemberIdAndTaskTypeAndStatusIn(String memberId, AiTaskType taskType, Collection<AiTaskStatus> statuses);

    /** Khóa dòng (SELECT ... FOR UPDATE) để callback, hủy và job quét không ghi đè trạng thái của nhau. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from AiTask t where t.id = :id")
    Optional<AiTask> findByIdForUpdate(@Param("id") String id);

    /** Score đang có tác vụ loại này ở các trạng thái cho trước (dùng để chặn thử lại khi OMR còn chạy). */
    boolean existsByScoreIdAndTaskTypeAndStatusIn(
            String scoreId, AiTaskType taskType, Collection<AiTaskStatus> statuses);

    /** Task chưa gửi được sang music-ai (step còn null) và đã im lặng từ trước mốc {@code before}. */
    List<AiTask> findByTaskTypeAndStatusAndStepIsNullAndUpdatedAtBefore(
            AiTaskType taskType, AiTaskStatus status, LocalDateTime before);

    /** Task có step và status cho trước, không cập nhật gì từ trước mốc {@code before} (QUEUED hoặc đang chạy). */
    List<AiTask> findByTaskTypeAndStatusAndStepAndUpdatedAtBefore(
            AiTaskType taskType, AiTaskStatus status, String step, LocalDateTime before);

    /** Task đang chạy không có callback nào từ trước mốc {@code before}. */
    List<AiTask> findByTaskTypeAndStatusAndUpdatedAtBefore(
            AiTaskType taskType, AiTaskStatus status, LocalDateTime before);

    // ---- Tác vụ xuất file (AUDIO_SYNTHESIS, FORMAT_CONVERSION)

    /** Số tác vụ thuộc các loại cho trước của người dùng đang ở các trạng thái cho trước. */
    long countByMemberIdAndTaskTypeInAndStatusIn(
            String memberId, Collection<AiTaskType> taskTypes, Collection<AiTaskStatus> statuses);

    /** Số tác vụ thuộc các loại cho trước của người dùng được tạo sau mốc {@code after}. */
    long countByMemberIdAndTaskTypeInAndCreatedAtAfter(
            String memberId, Collection<AiTaskType> taskTypes, LocalDateTime after);

    /** Tác vụ đang chạy của một bản nhạc (dùng để không tạo task xuất trùng). */
    List<AiTask> findByScoreIdAndTaskTypeInAndStatusIn(
            String scoreId, Collection<AiTaskType> taskTypes, Collection<AiTaskStatus> statuses);

    /** Tác vụ có trạng thái cho trước không cập nhật gì từ trước mốc {@code before} (job quét task xuất). */
    List<AiTask> findByTaskTypeInAndStatusAndUpdatedAtBefore(
            Collection<AiTaskType> taskTypes, AiTaskStatus status, LocalDateTime before);
}
