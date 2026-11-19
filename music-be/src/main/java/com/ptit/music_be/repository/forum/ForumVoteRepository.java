package com.ptit.music_be.repository.forum;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ptit.music_be.entity.ForumVote;

public interface ForumVoteRepository extends JpaRepository<ForumVote, String> {

    Optional<ForumVote> findByMemberIdAndThreadId(String memberId, String threadId);

    Optional<ForumVote> findByMemberIdAndPostId(String memberId, String postId);

    /**
     * Ghi phiếu cho chủ đề nếu chưa có (INSERT IGNORE theo khóa duy nhất member + chủ đề): hai lần bấm cùng lúc không làm
     * lỗi trùng khóa. Trả số dòng đã chèn (0 nếu đã có phiếu).
     */
    @Modifying
    @Query(
            value = "INSERT IGNORE INTO forum_votes (id, member_id, thread_id, created_at)"
                    + " VALUES (:id, :memberId, :threadId, NOW(6))",
            nativeQuery = true)
    int insertThreadVoteIgnore(
            @Param("id") String id, @Param("memberId") String memberId, @Param("threadId") String threadId);

    /** Như {@link #insertThreadVoteIgnore} cho bài trả lời. */
    @Modifying
    @Query(
            value = "INSERT IGNORE INTO forum_votes (id, member_id, post_id, created_at)"
                    + " VALUES (:id, :memberId, :postId, NOW(6))",
            nativeQuery = true)
    int insertPostVoteIgnore(
            @Param("id") String id, @Param("memberId") String memberId, @Param("postId") String postId);

    long countByThreadId(String threadId);

    long countByPostId(String postId);

    @Query("select v.thread.id, count(v) from ForumVote v where v.thread.id in :ids group by v.thread.id")
    List<Object[]> countByThreadIds(@Param("ids") Collection<String> ids);

    @Query("select v.post.id, count(v) from ForumVote v where v.post.id in :ids group by v.post.id")
    List<Object[]> countByPostIds(@Param("ids") Collection<String> ids);

    @Query("select v.thread.id from ForumVote v where v.member.id = :memberId and v.thread.id in :ids")
    List<String> threadIdsVotedBy(@Param("memberId") String memberId, @Param("ids") Collection<String> ids);

    @Query("select v.post.id from ForumVote v where v.member.id = :memberId and v.post.id in :ids")
    List<String> postIdsVotedBy(@Param("memberId") String memberId, @Param("ids") Collection<String> ids);
}
