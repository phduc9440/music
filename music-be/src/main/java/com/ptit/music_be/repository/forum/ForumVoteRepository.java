package com.ptit.music_be.repository.forum;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ptit.music_be.entity.ForumVote;

public interface ForumVoteRepository extends JpaRepository<ForumVote, String> {

    Optional<ForumVote> findByMemberIdAndThreadId(String memberId, String threadId);

    Optional<ForumVote> findByMemberIdAndPostId(String memberId, String postId);

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
