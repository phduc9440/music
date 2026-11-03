package com.ptit.music_be.repository;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
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
}
