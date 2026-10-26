package com.ptit.music_be.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreTag;
import com.ptit.music_be.entity.Tag;

@Repository
public interface ScoreTagRepository extends JpaRepository<ScoreTag, String> {

    List<ScoreTag> findByScore(Score score);

    List<ScoreTag> findByTag(Tag tag);
}
