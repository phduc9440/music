package com.ptit.music_be.repository.score;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ptit.music_be.dto.enums.score.CommentStatus;
import com.ptit.music_be.entity.ScoreComment;

public interface ScoreCommentRepository extends JpaRepository<ScoreComment, String> {

    /** Góp ý gốc của một bản nhạc, theo vị trí trong bài rồi thời gian. */
    @Query("select c from ScoreComment c join fetch c.author left join fetch c.resolvedBy"
            + " where c.score.id = :scoreId and c.parent is null order by c.startMeasure, c.endMeasure, c.createdAt")
    List<ScoreComment> findRootsOfScore(@Param("scoreId") String scoreId);

    /** Trả lời của các góp ý gốc, cũ trước. */
    @Query(
            "select c from ScoreComment c join fetch c.author where c.parent.id in :parentIds order by c.createdAt, c.id")
    List<ScoreComment> findRepliesOf(@Param("parentIds") Collection<String> parentIds);

    @Query("select c from ScoreComment c join fetch c.author where c.parent.id = :parentId order by c.createdAt, c.id")
    List<ScoreComment> findRepliesOf(@Param("parentId") String parentId);

    @Query("select count(c) from ScoreComment c where c.score.id = :scoreId and c.parent is null"
            + " and c.status = :status")
    long countRoots(@Param("scoreId") String scoreId, @Param("status") CommentStatus status);

    /** Id người đã viết góp ý hoặc trả lời trên bản nhạc (gợi ý @nhắc tên ở bản công khai). */
    @Query("select distinct c.author.id from ScoreComment c where c.score.id = :scoreId")
    List<String> findAuthorIdsOfScore(@Param("scoreId") String scoreId);

    /** Xóa bằng câu DELETE: trả lời và @nhắc tên xóa theo bằng ON DELETE CASCADE ở DB. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from ScoreComment c where c.id = :id")
    int deleteDirectly(@Param("id") String id);
}
