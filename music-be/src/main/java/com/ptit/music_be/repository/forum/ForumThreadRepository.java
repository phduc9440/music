package com.ptit.music_be.repository.forum;

import java.time.LocalDateTime;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ptit.music_be.entity.ForumThread;

public interface ForumThreadRepository extends JpaRepository<ForumThread, String> {

    @Query("select t from ForumThread t join fetch t.author join fetch t.category where t.id = :id")
    Optional<ForumThread> findDetail(@Param("id") String id);

    /** Số chủ đề một người đặt từ mốc {@code after} (giới hạn cho tài khoản mới). */
    long countByAuthorIdAndCreatedAtAfter(String authorId, LocalDateTime after);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from ForumThread t where t.id = :id")
    int deleteDirectly(@Param("id") String id);
}
