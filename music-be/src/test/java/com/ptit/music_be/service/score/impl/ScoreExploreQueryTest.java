package com.ptit.music_be.service.score.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.DifficultyLevel;
import com.ptit.music_be.dto.response.PageResponse;
import com.ptit.music_be.dto.response.ScoreSummaryResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreReview;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.repository.ScoreReviewRepository;
import com.ptit.music_be.service.score.ScoreService;

/**
 * Chạy các câu JPQL của trang Khám phá với DB thật (cần MySQL đang chạy). Mỗi ca tự tạo dữ liệu trong transaction rồi
 * hoàn tác, và lọc theo một từ khóa riêng để không lẫn với dữ liệu có sẵn.
 */
@SpringBootTest
@Transactional
class ScoreExploreQueryTest {

    @Autowired
    ScoreService scoreService;

    @Autowired
    ScoreRepository scoreRepository;

    @Autowired
    MemberRepository memberRepository;

    @Autowired
    ScoreReviewRepository reviewRepository;

    private String tag;
    private Score loved;
    private Score viewed;
    private Score quiet;

    @BeforeEach
    void seed() {
        tag = "zzexplore" + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        Member owner = member("owner", "Người Chia Sẻ");
        Member r1 = member("r1", null);
        Member r2 = member("r2", null);

        loved = score(owner, "Loved", "PUBLIC", 5L, DifficultyLevel.EASY);
        viewed = score(owner, "Viewed", "PUBLIC", 50L, DifficultyLevel.HARD);
        quiet = score(owner, "Quiet", "PUBLIC", 10L, DifficultyLevel.EASY);
        score(owner, "Private", "PRIVATE", 999L, DifficultyLevel.EASY);
        score(owner, "Pending", "PENDING", 999L, DifficultyLevel.EASY);

        review(loved, r1, 5);
        review(loved, r2, 4); // trung bình 4,5
        review(viewed, r1, 3);
        review(quiet, r1, null); // chỉ bình luận, không tính sao
    }

    private Member member(String name, String fullName) {
        return memberRepository.save(Member.builder()
                .email(tag + name + "@test.local")
                .fullName(fullName)
                .build());
    }

    private Score score(Member owner, String title, String visibility, long views, DifficultyLevel level) {
        return scoreRepository.save(Score.builder()
                .member(owner)
                .title(tag + " " + title)
                .visibility(visibility)
                .viewCount(views)
                .difficulty(level)
                .isOfficial(false)
                .build());
    }

    private void review(Score score, Member member, Integer rating) {
        reviewRepository.save(
                ScoreReview.builder().score(score).member(member).rating(rating).build());
    }

    private PageResponse<ScoreSummaryResponse> explore(String keyword, String difficulty, String sort) {
        return scoreService.getPublicScores(0, 50, keyword, difficulty, null, sort);
    }

    private static List<String> titles(PageResponse<ScoreSummaryResponse> page) {
        return page.getContent().stream().map(ScoreSummaryResponse::getTitle).toList();
    }

    @Test
    void onlyPublicScoresAreListed() {
        List<String> titles = titles(explore(tag, null, null));

        assertEquals(3, titles.size());
        assertEquals(false, titles.stream().anyMatch(t -> t.contains("Private") || t.contains("Pending")));
    }

    @Test
    void topRatedFirstAndUnratedLast() {
        assertEquals(
                List.of(tag + " Loved", tag + " Viewed", tag + " Quiet"), titles(explore(tag, null, "RATING")));
    }

    @Test
    void mostViewedFirst() {
        assertEquals(
                List.of(tag + " Viewed", tag + " Quiet", tag + " Loved"), titles(explore(tag, null, "VIEWS")));
    }

    @Test
    void cardsCarryNameCountsAndAverageButNeverTheEmail() {
        ScoreSummaryResponse card = explore(tag, null, "RATING").getContent().get(0);

        assertEquals(tag + " Loved", card.getTitle());
        assertEquals("Người Chia Sẻ", card.getOwnerName());
        assertNull(card.getOwnerEmail());
        assertEquals(5L, card.getViewCount());
        assertEquals(2L, card.getRatingCount());
        assertEquals(4.5, card.getRatingAverage());

        ScoreSummaryResponse unrated = explore(tag, null, "RATING").getContent().get(2);
        assertEquals(0L, unrated.getRatingCount());
        assertNull(unrated.getRatingAverage());
    }

    @Test
    void difficultyAndKeywordFiltersApply() {
        assertEquals(List.of(tag + " Viewed"), titles(explore(tag, "HARD", "VIEWS")));
        assertEquals(2, explore(tag, "EASY", null).getTotalElements());
        // "%" là ký tự thường, không khớp mọi tên
        assertEquals(0, explore(tag + "%", null, null).getTotalElements());
        assertEquals(0, scoreService.getPublicScores(0, 50, tag, null, "no-such-tag", null).getTotalElements());
    }

    @Test
    void aLibraryCopyIsNotListedNextToItsOriginal() {
        Score copy = score(quiet.getMember(), "Quiet", "PUBLIC", 0L, DifficultyLevel.EASY);
        copy.setIsOfficial(true);
        copy.setOriginalScoreId(quiet.getId());
        scoreRepository.save(copy);

        List<String> titles = titles(explore(tag, null, null));

        // bản gốc hiện một lần, bản sao trong kho mẫu không hiện thêm lần nữa
        assertEquals(1, titles.stream().filter(t -> t.equals(tag + " Quiet")).count());
        assertEquals(3, titles.size());
    }

    @Test
    void invalidValuesAreRejected() {
        assertThrows(AppException.class, () -> explore(null, null, "RANDOM"));
        assertThrows(AppException.class, () -> explore(null, "IMPOSSIBLE", null));
    }
}
