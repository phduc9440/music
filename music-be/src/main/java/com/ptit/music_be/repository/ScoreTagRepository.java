package com.ptit.music_be.repository;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreTag;
import com.ptit.music_be.entity.Tag;

@Repository
public interface ScoreTagRepository extends JpaRepository<ScoreTag, String> {

    List<ScoreTag> findByScore(Score score);

    List<ScoreTag> findByTag(Tag tag);

    /** Tag của nhiều bản nhạc trong một câu truy vấn (tránh N+1 khi hiện danh sách). */
    @Query("select st from ScoreTag st join fetch st.tag where st.score.id in :scoreIds")
    List<ScoreTag> findByScoreIdInFetchTag(@Param("scoreIds") Collection<String> scoreIds);
}
