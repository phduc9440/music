package com.ptit.music_be.repository;

import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ptit.music_be.entity.Team;

public interface TeamRepository extends JpaRepository<Team, String> {

    /** Khóa dòng team khi thêm thành viên để hai lời mời chấp nhận cùng lúc không vượt hạn mức. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from Team t where t.id = :id")
    Optional<Team> findByIdForUpdate(@Param("id") String id);
}
