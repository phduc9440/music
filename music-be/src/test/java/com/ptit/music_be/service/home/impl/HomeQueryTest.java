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

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.SharePermission;
import com.ptit.music_be.dto.response.HomeSummaryResponse;
import com.ptit.music_be.dto.response.PublicHomeResponse;
import com.ptit.music_be.dto.response.ScoreSummaryResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.MemberScore;
import com.ptit.music_be.entity.PracticeSession;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.repository.HomeQueryRepository;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.MemberScoreRepository;
import com.ptit.music_be.repository.PracticeSessionRepository;
import com.ptit.music_be.repository.ScoreCounterRepository;
import com.ptit.music_be.repository.ScoreRepository;

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
    ScoreCounterRepository scoreCounterRepository;

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
    void featuredPutsThisWeeksMostViewedFirstAndIgnoresOlderViews() {
        Score hot = score(owner, "Hot tuần này", "PUBLIC", null, 0);
        Score warm = score(owner, "Ấm", "PUBLIC", null, 0);
        Score old = score(owner, "Hot tuần trước", "PUBLIC", null, 999_999); // tổng lượt xem lớn nhưng đã nguội
        Score hidden = score(owner, "Riêng tư", "PRIVATE", null, 0);
        LocalDate today = LocalDate.now();
        for (int i = 0; i < 5; i++) {
            scoreCounterRepository.incrementDailyViews(hot.getId(), today);
            scoreCounterRepository.incrementDailyViews(hidden.getId(), today);
        }
        scoreCounterRepository.incrementDailyViews(warm.getId(), today.minusDays(2));
        for (int i = 0; i < 50; i++) {
            scoreCounterRepository.incrementDailyViews(old.getId(), today.minusDays(10));
        }
        homeService.evictPublicHome();

        PublicHomeResponse home = homeService.getPublicHome();
        List<String> ids =
                home.getFeatured().stream().map(ScoreSummaryResponse::getId).toList();

        assertEquals(hot.getId(), ids.get(0));
        assertEquals(warm.getId(), ids.get(1));
        assertTrue(home.getFeaturedWeekly() >= 2);
        // Bản riêng tư có lượt xem cũng không lọt vào trang của khách
        assertEquals(false, ids.contains(hidden.getId()));
        // Bản chỉ hot ở tuần trước không nằm trong phần "tuần", chỉ có thể xuất hiện ở phần bổ sung phía sau
        assertTrue(!ids.contains(old.getId()) || ids.indexOf(old.getId()) >= home.getFeaturedWeekly());
    }

    @Test
    void dailyViewsAccumulateInOneRowPerDay() {
        Score s = score(owner, "Đếm", "PUBLIC", null, 0);
        LocalDate today = LocalDate.now();
        scoreCounterRepository.incrementDailyViews(s.getId(), today);
        scoreCounterRepository.incrementDailyViews(s.getId(), today);
        scoreCounterRepository.incrementDailyViews(s.getId(), today.minusDays(1));

        List<Object[]> since =
                homeQueryRepository.topPublicSince(today, org.springframework.data.domain.PageRequest.of(0, 500));
        long todayViews = since.stream()
                .filter(r -> r[0].equals(s.getId()))
                .mapToLong(r -> ((Number) r[1]).longValue())
                .sum();
        assertEquals(2, todayViews);
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
