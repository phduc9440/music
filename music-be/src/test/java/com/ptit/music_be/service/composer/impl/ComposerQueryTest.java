package com.ptit.music_be.service.composer.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.List;
import java.util.UUID;

import jakarta.persistence.EntityManager;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.ComposerPeriod;
import com.ptit.music_be.dto.request.ComposerRequest;
import com.ptit.music_be.dto.response.ComposerResponse;
import com.ptit.music_be.dto.response.ScoreSummaryResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.composer.ComposerService;
import com.ptit.music_be.service.score.PublicScoreFilter;
import com.ptit.music_be.service.score.ScoreService;

/**
 * Nhạc sĩ và bộ lọc Khám phá với DB thật (cần MySQL đang chạy). Mỗi ca tự tạo dữ liệu trong transaction rồi hoàn tác;
 * tên nhạc sĩ và bản nhạc mang một mã riêng để không lẫn dữ liệu có sẵn.
 */
@SpringBootTest
@Transactional
class ComposerQueryTest {

    @Autowired
    ComposerService composerService;

    @Autowired
    ScoreService scoreService;

    @Autowired
    ScoreRepository scoreRepository;

    @Autowired
    MemberRepository memberRepository;

    @Autowired
    EntityManager entityManager;

    private String tag;
    private Member owner;

    @BeforeEach
    void seed() {
        tag = "zzcomp" + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        owner = memberRepository.save(Member.builder()
                .email(tag + "@test.local")
                .fullName("Người chia sẻ")
                .build());
    }

    private ComposerResponse composer(String name, String aliases) {
        return composerService.create(ComposerRequest.builder()
                .name(name)
                .aliases(aliases)
                .birthYear(1685)
                .deathYear(1750)
                .period(ComposerPeriod.BAROQUE)
                .build());
    }

    private Score score(String title, String composer, String visibility) {
        return scoreRepository.saveAndFlush(Score.builder()
                .member(owner)
                .title(tag + " " + title)
                .composer(composer)
                .visibility(visibility)
                .isOfficial(false)
                .viewCount(0L)
                .build());
    }

    private Score reload(Score s) {
        entityManager.clear();
        return scoreRepository.findById(s.getId()).orElseThrow();
    }

    @Test
    void newScoresAreLinkedByNameOrAliasIgnoringAccentsAndPunctuation() {
        ComposerResponse c = composer(tag + " Johann Bach", tag + " Bach, " + tag + " J.S. Bách");

        assertEquals(
                c.getId(),
                score("A", "  " + tag.toUpperCase() + " johann bach ", "PRIVATE")
                        .getComposerId());
        assertEquals(c.getId(), score("B", tag + " j s bach", "PRIVATE").getComposerId());
        assertNull(score("C", tag + " Mozart", "PRIVATE").getComposerId());
    }

    @Test
    void editingTheComposerTextRelinksTheScore() {
        ComposerResponse c = composer(tag + " Vivaldi", null);
        Score s = score("Mùa xuân", "Không rõ", "PRIVATE");
        assertNull(s.getComposerId());

        s.setComposer(tag + " Vivaldi");
        scoreRepository.saveAndFlush(s);

        assertEquals(c.getId(), reload(s).getComposerId());
    }

    @Test
    void creatingAComposerLinksExistingScoresWithoutTouchingTheirUpdateTime() {
        Score s = score("Cũ", tag + " Chopin", "PRIVATE");
        var updatedBefore = reload(s).getUpdatedAt();

        ComposerResponse c = composer(tag + " Chopin", null);

        Score after = reload(s);
        assertEquals(c.getId(), after.getComposerId());
        assertEquals(updatedBefore, after.getUpdatedAt());
        assertEquals(1, c.getScoreCount());
    }

    @Test
    void deletingAComposerOnlyRemovesTheLink() {
        ComposerResponse c = composer(tag + " Satie", null);
        Score s = score("Gymnopédie", tag + " Satie", "PRIVATE");

        composerService.delete(c.getId());

        Score after = reload(s);
        assertNull(after.getComposerId());
        assertEquals(tag + " Satie", after.getComposer());
    }

    @Test
    void publicListCountsOnlyPublicScoresAndShowsTopTitles() {
        ComposerResponse c = composer(tag + " Liszt", null);
        Score popular = score("Nổi tiếng", tag + " Liszt", "PUBLIC");
        popular.setViewCount(99L);
        scoreRepository.saveAndFlush(popular);
        score("Ít xem", tag + " Liszt", "PUBLIC");
        score("Riêng tư", tag + " Liszt", "PRIVATE");

        List<ComposerResponse> found = composerService.listPublic(tag + " liszt", null, 10);

        assertEquals(1, found.size());
        assertEquals(c.getId(), found.get(0).getId());
        assertEquals(2, found.get(0).getScoreCount());
        assertEquals(List.of(tag + " Nổi tiếng", tag + " Ít xem"), found.get(0).getTopTitles());
        assertEquals(c.getId(), composerService.getBySlug(c.getSlug()).getId());
    }

    @Test
    void exploreFiltersByComposerStaffCountAndKey() {
        ComposerResponse c = composer(tag + " Handel", null);
        Score piano = score("Piano", tag + " Handel", "PUBLIC");
        piano.setStaffCount(2);
        piano.setKeySignature("G");
        Score voice = score("Hát", tag + " Handel", "PUBLIC");
        voice.setStaffCount(1);
        voice.setKeySignature("Am");
        Score choir = score("Hợp xướng", tag + " Handel", "PUBLIC");
        choir.setStaffCount(4);
        scoreRepository.saveAllAndFlush(List.of(piano, voice, choir));

        assertEquals(
                3,
                explore(new PublicScoreFilter(tag, null, null, c.getId(), null, null))
                        .size());
        assertEquals(List.of(tag + " Hát"), explore(new PublicScoreFilter(tag, null, null, null, 1, null)));
        assertEquals(List.of(tag + " Hợp xướng"), explore(new PublicScoreFilter(tag, null, null, null, 3, null)));
        assertEquals(List.of(tag + " Piano"), explore(new PublicScoreFilter(tag, null, null, null, null, "G")));
        assertEquals(
                0,
                explore(new PublicScoreFilter(tag, null, null, "no-such-id", null, null))
                        .size());
        assertThrows(
                AppException.class,
                () -> scoreService.getPublicScores(0, 10, new PublicScoreFilter(tag, null, null, null, 7, null), null));
    }

    private List<String> explore(PublicScoreFilter filter) {
        return scoreService.getPublicScores(0, 50, filter, null).getContent().stream()
                .map(ScoreSummaryResponse::getTitle)
                .sorted()
                .toList();
    }

    @Test
    void invalidInputIsRejected() {
        composer(tag + " Haydn", null);

        assertCode(ErrorCode.COMPOSER_DUPLICATED, () -> composer(tag + " HAYDN", null));
        assertCode(ErrorCode.COMPOSER_NAME_INVALID, () -> composer("   ", null));
        assertCode(
                ErrorCode.COMPOSER_YEARS_INVALID,
                () -> composerService.create(ComposerRequest.builder()
                        .name(tag + " X")
                        .birthYear(1900)
                        .deathYear(1800)
                        .build()));
        // Có ảnh thì phải là https và có nguồn, giấy phép
        assertCode(
                ErrorCode.COMPOSER_IMAGE_INVALID,
                () -> composerService.create(ComposerRequest.builder()
                        .name(tag + " Y")
                        .imageUrl("https://upload.wikimedia.org/a.jpg")
                        .imageSource("https://commons.wikimedia.org/wiki/File:a.jpg")
                        .build()));
        assertCode(
                ErrorCode.COMPOSER_IMAGE_INVALID,
                () -> composerService.create(ComposerRequest.builder()
                        .name(tag + " Z")
                        .imageUrl("http://example.com/a.jpg")
                        .imageSource("https://example.com")
                        .imageLicense("Public domain")
                        .build()));
    }

    private static void assertCode(ErrorCode code, Runnable action) {
        AppException e = assertThrows(AppException.class, action::run);
        assertEquals(code, e.getErrorCode());
    }
}
