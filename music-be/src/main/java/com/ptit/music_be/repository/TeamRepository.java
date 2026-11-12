package com.ptit.music_be.repository;

import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ptit.music_be.entity.Team;

public interface TeamRepository extends JpaRepository<Team, String> {

    /** Khóa dòng team khi thêm thành viên để hai lời mời chấp nhận cùng lúc không vượt hạn mức. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from Team t where t.id = :id")
    Optional<Team> findByIdForUpdate(@Param("id") String id);

    /**
     * Xóa team bằng câu DELETE trực tiếp: thành viên, lời mời, show, bài trong show, nhật ký xóa theo bằng ON DELETE CASCADE
     * và scores.team_id về NULL ở DB. Không dùng delete(entity) vì các TeamMember đã nạp vẫn trỏ tới team làm Hibernate báo
     * lỗi lúc flush; persistence context được xóa sau câu này nên đừng dùng lại entity team đã nạp.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from Team t where t.id = :id")
    int deleteDirectly(@Param("id") String id);
}
