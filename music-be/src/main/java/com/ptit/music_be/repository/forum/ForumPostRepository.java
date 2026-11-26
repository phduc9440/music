package com.ptit.music_be.repository.forum;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ptit.music_be.entity.ForumPost;

public interface ForumPostRepository extends JpaRepository<ForumPost, String> {

    @Query("select p from ForumPost p join fetch p.author where p.thread.id = :threadId order by p.createdAt, p.id")
    List<ForumPost> findOfThread(@Param("threadId") String threadId);

    /** Số trả lời còn hiển thị của các chủ đề: [threadId, count]. */
    @Query("select p.thread.id, count(p) from ForumPost p where p.thread.id in :ids group by p.thread.id")
    List<Object[]> countByThreadIds(@Param("ids") Collection<String> ids);

    /** Lần trả lời gần nhất của các chủ đề: [threadId, max(createdAt)]. */
    @Query("select p.thread.id, max(p.createdAt) from ForumPost p where p.thread.id in :ids group by p.thread.id")
    List<Object[]> lastPostAtByThreadIds(@Param("ids") Collection<String> ids);

    /** Có bài trả lời của người khác ngoài tác giả chủ đề không (chặn tác giả xóa chủ đề đã có thảo luận). */
    @Query("select count(p) from ForumPost p where p.thread.id = :threadId and p.author.id <> :authorId")
    long countByOthers(@Param("threadId") String threadId, @Param("authorId") String authorId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from ForumPost p where p.id = :id")
    int deleteDirectly(@Param("id") String id);
}
