package com.ptit.music_be.repository.score;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ptit.music_be.entity.ScoreSuggestionChange;

public interface ScoreSuggestionChangeRepository extends JpaRepository<ScoreSuggestionChange, String> {

    /** Các ô của một đề xuất theo thứ tự trong bài. */
    @Query("select c from ScoreSuggestionChange c where c.suggestion.id = :suggestionId"
            + " order by c.partIndex, c.measureIndex")
    List<ScoreSuggestionChange> findBySuggestion(@Param("suggestionId") String suggestionId);

    /** Các ô của nhiều đề xuất một lượt (không theo thứ tự). */
    List<ScoreSuggestionChange> findBySuggestionIdIn(Collection<String> suggestionIds);

    /** Số ô của nhiều đề xuất một lượt: mỗi phần tử là {@code [suggestionId, count]}. */
    @Query("select c.suggestion.id, count(c) from ScoreSuggestionChange c where c.suggestion.id in :ids"
            + " group by c.suggestion.id")
    List<Object[]> countBySuggestionIds(@Param("ids") Collection<String> ids);
}
