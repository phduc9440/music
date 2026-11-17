package com.ptit.music_be.repository.forum;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ptit.music_be.entity.ForumSubscription;

public interface ForumSubscriptionRepository extends JpaRepository<ForumSubscription, String> {

    Optional<ForumSubscription> findByThreadIdAndMemberId(String threadId, String memberId);

    boolean existsByThreadIdAndMemberId(String threadId, String memberId);

    @Query("select s from ForumSubscription s join fetch s.member where s.thread.id = :threadId")
    List<ForumSubscription> findOfThread(@Param("threadId") String threadId);

    @Query("select s.thread.id from ForumSubscription s where s.member.id = :memberId and s.thread.id in :ids")
    List<String> threadIdsSubscribedBy(@Param("memberId") String memberId, @Param("ids") Collection<String> ids);
}
