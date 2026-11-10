package com.ptit.music_be.service.score.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import jakarta.persistence.EntityManager;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.OfficialRequestStatus;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.OfficialRequest;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.OfficialRequestRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.score.ScoreService;

/**
 * Chạy bảng và các câu JPQL của lời xin đưa vào kho mẫu với DB thật (cần MySQL đang chạy, migration tự áp dụng). Mỗi
 * ca tự tạo dữ liệu trong transaction rồi hoàn tác.
 */
@SpringBootTest
@Transactional
class OfficialRequestQueryTest {

    @Autowired
    ScoreService scoreService;

    @Autowired
    ScoreRepository scoreRepository;

    @Autowired
    MemberRepository memberRepository;

    @Autowired
    OfficialRequestRepository requestRepository;

    @Autowired
    EntityManager entityManager;

    private String tag;
    private Member admin;
    private Member owner;
    private Score free;
    private Score asked;
    private Score taken;
    private Score copy;
    private OfficialRequest askedRequest;
    private OfficialRequest takenRequest;

    @BeforeEach
    void seed() {
        tag = "zzoff" + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        admin = memberRepository.save(
                Member.builder().email(tag + "a@test.local").fullName("Admin").build());
        owner = memberRepository.save(
                Member.builder().email(tag + "o@test.local").fullName("Chủ").build());

        free = score(owner, "Free");
        asked = score(owner, "Asked");
        taken = score(owner, "Taken");
        copy = score(admin, "Copy");
        copy.setIsOfficial(true);
        copy.setOriginalScoreId(taken.getId());
        copy.setArrangerName("Chủ");
        scoreRepository.save(copy);

        askedRequest = request(asked, OfficialRequestStatus.PENDING, null);
        takenRequest = request(taken, OfficialRequestStatus.ACCEPTED, copy.getId());
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private Score score(Member member, String title) {
        return scoreRepository.save(Score.builder()
                .member(member)
                .title(tag + " " + title)
                .visibility("PUBLIC")
                .isOfficial(false)
                .build());
    }

    private OfficialRequest request(Score score, OfficialRequestStatus status, String copyId) {
        return requestRepository.save(OfficialRequest.builder()
                .score(score)
                .requestedBy(admin)
                .owner(owner)
                .status(status)
                .copyScoreId(copyId)
                .build());
    }

    private void asAdmin() {
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(admin.getEmail(), "x", "ROLE_ADMIN"));
    }

    @Test
    void onlyScoresNobodyHasBeenAskedAboutAreCandidates() {
        asAdmin();

        List<String> titles = scoreService.getOfficialCandidates(0, 50, tag).getContent().stream()
                .map(s -> s.getTitle())
                .toList();

        // đã có lời xin đang chờ hoặc đã đồng ý, và bản sao trong kho, đều không nằm trong danh sách chọn
        assertEquals(List.of(tag + " Free"), titles);
    }

    @Test
    void ownerSeesOnlyPendingRequestsWithTheirScore() {
        List<OfficialRequest> mine = requestRepository.findPendingOfOwner(owner.getId());

        assertEquals(1, mine.size());
        assertEquals(asked.getId(), mine.get(0).getScore().getId());
        assertEquals(admin.getId(), mine.get(0).getRequestedBy().getId());
    }

    @Test
    void adminListFiltersByStatus() {
        assertEquals(2, requestRepository.searchForAdmin("", PageRequest.of(0, 50)).stream()
                .filter(r -> r.getOwner().getId().equals(owner.getId()))
                .count());
        List<OfficialRequest> accepted = requestRepository
                .searchForAdmin("ACCEPTED", PageRequest.of(0, 50))
                .getContent();
        assertTrue(accepted.stream().allMatch(r -> r.getStatus() == OfficialRequestStatus.ACCEPTED));
        assertTrue(accepted.stream().anyMatch(r -> r.getId().equals(takenRequest.getId())));
    }

    @Test
    void duplicateChecksSeeTheRightStatuses() {
        assertTrue(requestRepository.existsByScoreIdAndStatusIn(
                asked.getId(), Set.of(OfficialRequestStatus.PENDING)));
        assertFalse(requestRepository.existsByScoreIdAndStatusIn(
                asked.getId(), Set.of(OfficialRequestStatus.ACCEPTED)));
        assertTrue(requestRepository.existsByScoreIdAndStatusIn(
                taken.getId(), Set.of(OfficialRequestStatus.ACCEPTED)));
    }

    @Test
    void aCopyThatWasTrashedAnyOtherWayFreesTheOriginalToo() {
        asAdmin();
        // lời xin vẫn ghi ACCEPTED nhưng bản sao đã vào thùng rác (ví dụ admin xóa thẳng bản sao)
        copy.setDeletedAt(java.time.LocalDateTime.now());
        scoreRepository.save(copy);
        entityManager.flush();
        entityManager.clear();

        assertFalse(requestRepository.hasLiveAcceptedCopy(taken.getId()));
        assertTrue(scoreService.getOfficialCandidates(0, 50, tag).getContent().stream()
                .anyMatch(s -> s.getTitle().equals(tag + " Taken")));
    }

    @Test
    void anAliveCopyKeepsTheOriginalOutOfTheCandidates() {
        assertTrue(requestRepository.hasLiveAcceptedCopy(taken.getId()));
        assertFalse(requestRepository.hasLiveAcceptedCopy(asked.getId()));
    }

    @Test
    void removingTheCopyFromTheLibraryTrashesItAndFreesTheOriginalForANewRequest() {
        asAdmin();

        scoreService.unmarkOfficial(copy.getId());
        entityManager.flush();
        entityManager.clear();

        // bản sao vào thùng rác (ẩn khỏi mọi truy vấn), lời xin cũ được rút lại
        assertTrue(scoreRepository.findById(copy.getId()).isEmpty());
        assertEquals(
                OfficialRequestStatus.CANCELED,
                requestRepository.findById(takenRequest.getId()).orElseThrow().getStatus());
        // bản gốc của chủ không bị đụng tới và lại có thể được xin
        Score original = scoreRepository.findById(taken.getId()).orElseThrow();
        assertEquals("PUBLIC", original.getVisibility());
        assertFalse(Boolean.TRUE.equals(original.getIsOfficial()));
        assertTrue(scoreService.getOfficialCandidates(0, 50, tag).getContent().stream()
                .anyMatch(s -> s.getTitle().equals(tag + " Taken")));
    }
}
