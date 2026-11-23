package com.ptit.music_be.service.home.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import jakarta.persistence.EntityManager;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.score.SharePermission;
import com.ptit.music_be.dto.response.home.HomeSummaryResponse;
import com.ptit.music_be.dto.response.home.PublicHomeResponse;
import com.ptit.music_be.dto.response.score.ScoreSummaryResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.MemberScore;
import com.ptit.music_be.entity.PracticeSession;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.home.HomeQueryRepository;
import com.ptit.music_be.repository.practice.PracticeSessionRepository;
import com.ptit.music_be.repository.score.MemberScoreRepository;
import com.ptit.music_be.repository.score.ScoreRepository;

/**
 * Chạy các câu truy vấn của trang chủ với DB thật (cần MySQL đang chạy). Mỗi ca tự tạo dữ liệu trong transaction rồi
 * hoàn tác; số liệu toàn hệ thống được so theo độ chênh trước/sau để không phụ thuộc dữ liệu có sẵn.
 */
@SpringBootTest
@Transactional
class HomeQueryTest {

    @Autowired
    HomeServiceImpl homeService;

    @Autowired
    HomeQueryRepository homeQueryRepository;

    @Autowired
    ScoreRepository scoreRepository;

    @Autowired
    MemberRepository memberRepository;

    @Autowired
    MemberScoreRepository memberScoreRepository;

    @Autowired
    PracticeSessionRepository practiceSessionRepository;

    @Autowired
    JdbcTemplate jdbcTemplate;

    @Autowired
    EntityManager entityManager;

    private String tag;
    private Member owner;
    private Member other;

    @BeforeEach
    void seed() {
        tag = "zzhome" + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        owner = member("owner", "Chủ Bản Nhạc");
        other = member("other", null);
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(owner.getEmail(), "x", "ROLE_USER"));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
        homeService.evictPublicHome();
    }

    private Member member(String name, String fullName) {
        return memberRepository.save(Member.builder()
                .email(tag + name + "@test.local")
                .fullName(fullName)
                .build());
    }

    private Score score(Member member, String title, String visibility, String composer, long views) {
        return scoreRepository.save(Score.builder()
                .member(member)
                .title(tag + " " + title)
                .composer(composer)
                .visibility(visibility)
                .viewCount(views)
                .isOfficial(false)
                .build());
    }

    private void practice(Member member, Score score, LocalDateTime startedAt, int seconds) {
        practiceSessionRepository.save(PracticeSession.builder()
                .member(member)
                .score(score)
                .startedAt(startedAt)
                .endedAt(startedAt.plusSeconds(seconds))
                .durationSeconds(seconds)
                .build());
    }

    @Test
    void countsOnlyGrowWithPublicScores() {
        long publicBefore = homeQueryRepository.countPublicScores();
        long allBefore = homeQueryRepository.countScores();

        score(owner, "Public", "PUBLIC", null, 0);
        score(owner, "Private", "PRIVATE", null, 0);
        Score copy = score(owner, "Copy", "PUBLIC", null, 0);
        copy.setOriginalScoreId(UUID.randomUUID().toString()); // bản sao trong kho mẫu không tính hai lần
        scoreRepository.save(copy);

        assertEquals(publicBefore + 1, homeQueryRepository.countPublicScores());
        assertEquals(allBefore + 3, homeQueryRepository.countScores());
    }

    @Test
    void digitizedPagesCountOnlyFinishedOmr() {
        long before = homeQueryRepository.sumDigitizedPages();
        Score done = score(owner, "Done", "PRIVATE", null, 0);
        done.setSourceType("OMR");
        done.setProcessingStatus("COMPLETED");
        done.setPageCount(4);
        Score failed = score(owner, "Failed", "PRIVATE", null, 0);
        failed.setSourceType("OMR");
        failed.setProcessingStatus("FAILED");
        failed.setPageCount(9);
        scoreRepository.saveAll(List.of(done, failed));

        assertEquals(before + 4, homeQueryRepository.sumDigitizedPages());
    }

    @Test
    void publicHomeUsesGuestThumbnailsAndIsCached() {
        homeService.evictPublicHome();
        PublicHomeResponse first = homeService.getPublicHome();

        assertNotNull(first.getStats());
        assertTrue(first.getFeatured().size() <= HomeServiceImpl.FEATURED_SIZE);
        first.getFeatured().forEach(card -> {
            assertNull(card.getOwnerEmail());
            assertTrue(card.getThumbnailUrl() == null || card.getThumbnailUrl().startsWith("/api/public/scores/"));
        });
        // Gọi lại trong 5 phút trả đúng bản đã nhớ
        assertSame(first, homeService.getPublicHome());
    }

    @Test
    void featuredRanksViewsPerDayOfAgeSoNewPopularScoresBeatOldOnes() {
        Score fresh = score(owner, "Mới mà hot", "PUBLIC", null, 200_000);
        Score old = score(owner, "Cũ nhiều lượt", "PUBLIC", null, 300_000);
        Score hidden = score(owner, "Riêng tư", "PRIVATE", null, 900_000);
        scoreRepository.flush(); // chèn các dòng vào DB trước khi sửa ngày tạo bằng SQL
        // createdAt không sửa được qua entity (updatable = false), nên lùi ngày tạo bằng SQL
        jdbcTemplate.update(
                "update scores set created_at = ? where id = ?",
                LocalDateTime.now().minusDays(400),
                old.getId());
        entityManager.clear();
        homeService.evictPublicHome();

        List<String> ids = homeService.getPublicHome().getFeatured().stream()
                .map(ScoreSummaryResponse::getId)
                .toList();

        // 200000 lượt trong 1 ngày (200000/ngày) xếp trước 300000 lượt trong 400 ngày (~750/ngày)
        assertTrue(ids.contains(fresh.getId()));
        assertTrue(ids.contains(old.getId()));
        assertTrue(ids.indexOf(fresh.getId()) < ids.indexOf(old.getId()));
        assertEquals(false, ids.contains(hidden.getId()));
        assertTrue(ids.size() <= HomeServiceImpl.FEATURED_SIZE);
    }

    @Test
    void heatIsViewsPerDayOfAge() {
        ScoreSummaryResponse card = ScoreSummaryResponse.builder()
                .viewCount(300L)
                .createdAt(LocalDateTime.now().minusDays(9).minusHours(1))
                .build();

        assertEquals(30.0, HomeServiceImpl.heat(card), 0.001);
        assertEquals(0.0, HomeServiceImpl.heat(ScoreSummaryResponse.builder().build()), 0.001);
        assertEquals(
                5.0,
                HomeServiceImpl.heat(ScoreSummaryResponse.builder()
                        .viewCount(5L)
                        .createdAt(LocalDateTime.now())
                        .build()),
                0.001);
    }

    @Test
    void summaryListsPendingRequestsOnMyScores() {
        Score mine = score(owner, "Của tôi", "PRIVATE", null, 0);
        score(owner, "Chờ duyệt", "PENDING", null, 0);
        memberScoreRepository.save(MemberScore.builder()
                .member(other)
                .score(mine)
                .requestedPermission(SharePermission.EDIT)
                .requestedAt(LocalDateTime.now())
                .build());

        HomeSummaryResponse summary = homeService.getSummary();

        assertEquals("Chủ Bản Nhạc", summary.getDisplayName());
        assertEquals(1, summary.getAccessRequestCount());
        assertEquals(1, summary.getPendingPublicCount());
        assertEquals(1, summary.getPending().size());
        HomeSummaryResponse.PendingItem item = summary.getPending().get(0);
        assertEquals("ACCESS_REQUEST", item.getType());
        assertEquals(mine.getId(), item.getScoreId());
        assertEquals(other.getEmail(), item.getActorName()); // chưa có họ tên thì hiện email cho chủ bản nhạc
        assertEquals("EDIT", item.getPermission());
        assertEquals(2, summary.getRecentScores().size());
    }

    @Test
    void suggestionSkipsScoresIcannotOpenAnymore() {
        Score mine = score(owner, "Bài cũ", "PRIVATE", null, 0);
        Score theirs = score(other, "Đã gỡ công khai", "PRIVATE", null, 0);
        practice(owner, mine, LocalDateTime.now().minusDays(2), 300);
        practice(owner, theirs, LocalDateTime.now().minusDays(1), 300);

        HomeSummaryResponse.Suggestion suggestion = homeService.getSummary().getSuggestion();

        assertEquals("CONTINUE", suggestion.getReason());
        assertEquals(mine.getId(), suggestion.getScore().getId());
    }

    @Test
    void todayPracticeCountsOnlySessionsSinceMidnight() {
        Score mine = score(owner, "Bài tập", "PRIVATE", null, 0);
        LocalDateTime midnight = LocalDate.now().atStartOfDay();
        practice(owner, mine, midnight.minusMinutes(5), 600);
        practice(owner, mine, midnight.plusMinutes(1), 120);

        assertEquals(120, homeService.getSummary().getTodayPracticeSeconds());
    }

    @Test
    void privateScoreThumbnailIsHiddenFromGuests() {
        Score hidden = score(owner, "Riêng tư", "PRIVATE", null, 0);
        Score shown = score(owner, "Công khai", "PUBLIC", null, 0); // chưa có ảnh trang 1

        assertThrows(AppException.class, () -> homeService.loadPublicThumbnail(hidden.getId()));
        assertThrows(AppException.class, () -> homeService.loadPublicThumbnail(shown.getId()));
        assertThrows(AppException.class, () -> homeService.loadPublicThumbnail("no-such-score"));
    }
}
