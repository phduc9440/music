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
}
