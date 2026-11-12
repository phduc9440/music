package com.ptit.music_be.repository;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ptit.music_be.entity.ScoreCommentMention;

public interface ScoreCommentMentionRepository extends JpaRepository<ScoreCommentMention, String> {

    @Query("select m from ScoreCommentMention m join fetch m.member where m.comment.id in :commentIds")
    List<ScoreCommentMention> findByCommentIds(@Param("commentIds") Collection<String> commentIds);

    /** Id góp ý gốc có nhắc tới người này (ở góp ý gốc hoặc ở một trả lời) trên một bản nhạc. */
    @Query("select distinct coalesce(p.id, c.id) from ScoreCommentMention m join m.comment c left join c.parent p"
            + " where c.score.id = :scoreId and m.member.id = :memberId")
    List<String> findThreadIdsMentioning(@Param("scoreId") String scoreId, @Param("memberId") String memberId);

    @Modifying
    @Query("delete from ScoreCommentMention m where m.comment.id = :commentId")
    int deleteByCommentId(@Param("commentId") String commentId);
}
