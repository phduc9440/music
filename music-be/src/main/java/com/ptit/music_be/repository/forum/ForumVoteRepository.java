package com.ptit.music_be.repository.forum;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ptit.music_be.dto.enums.forum.ForumReaction;
import com.ptit.music_be.entity.ForumVote;

public interface ForumVoteRepository extends JpaRepository<ForumVote, String> {

    Optional<ForumVote> findByMemberIdAndThreadId(String memberId, String threadId);

    Optional<ForumVote> findByMemberIdAndPostId(String memberId, String postId);

    /**
     * Ghi lựa chọn thích / không thích cho chủ đề nếu chưa có phiếu (INSERT IGNORE theo khóa duy nhất member + chủ đề):
     * hai lần bấm cùng lúc không làm lỗi trùng khóa. Trả số dòng đã chèn (0 nếu đã có phiếu).
     */
    @Modifying
    @Query(
            value = "INSERT IGNORE INTO forum_votes (id, member_id, thread_id, reaction, created_at)"
                    + " VALUES (:id, :memberId, :threadId, :reaction, NOW(6))",
            nativeQuery = true)
    int insertThreadReactionIgnore(
            @Param("id") String id,
            @Param("memberId") String memberId,
            @Param("threadId") String threadId,
            @Param("reaction") String reaction);

    /** Như {@link #insertThreadReactionIgnore} cho bài trả lời. */
    @Modifying
    @Query(
            value = "INSERT IGNORE INTO forum_votes (id, member_id, post_id, reaction, created_at)"
                    + " VALUES (:id, :memberId, :postId, :reaction, NOW(6))",
            nativeQuery = true)
    int insertPostReactionIgnore(
            @Param("id") String id,
            @Param("memberId") String memberId,
            @Param("postId") String postId,
            @Param("reaction") String reaction);

    long countByThreadIdAndReaction(String threadId, ForumReaction reaction);

    long countByPostIdAndReaction(String postId, ForumReaction reaction);

    /** Mỗi dòng: [threadId, reaction, số phiếu]. */
    @Query("select v.thread.id, v.reaction, count(v) from ForumVote v where v.thread.id in :ids"
            + " group by v.thread.id, v.reaction")
    List<Object[]> countReactionsByThreadIds(@Param("ids") Collection<String> ids);

    /** Mỗi dòng: [postId, reaction, số phiếu]. */
    @Query("select v.post.id, v.reaction, count(v) from ForumVote v where v.post.id in :ids"
            + " group by v.post.id, v.reaction")
    List<Object[]> countReactionsByPostIds(@Param("ids") Collection<String> ids);

    /** Mỗi dòng: [threadId, reaction] của một thành viên. */
    @Query("select v.thread.id, v.reaction from ForumVote v where v.member.id = :memberId and v.thread.id in :ids")
    List<Object[]> threadReactionsBy(@Param("memberId") String memberId, @Param("ids") Collection<String> ids);

    /** Mỗi dòng: [postId, reaction] của một thành viên. */
    @Query("select v.post.id, v.reaction from ForumVote v where v.member.id = :memberId and v.post.id in :ids")
    List<Object[]> postReactionsBy(@Param("memberId") String memberId, @Param("ids") Collection<String> ids);
}
