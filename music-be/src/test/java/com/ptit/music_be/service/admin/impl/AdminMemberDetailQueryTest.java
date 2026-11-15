package com.ptit.music_be.service.admin.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.dto.response.admin.AdminMemberDetailResponse;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.service.admin.AdminMemberService;

/** Chạy các câu JPQL của chi tiết thành viên với DB thật (cần MySQL đang chạy). */
@SpringBootTest
class AdminMemberDetailQueryTest {

    @Autowired
    AdminMemberService service;

    @Autowired
    MemberRepository memberRepository;

    @PersistenceContext
    EntityManager entityManager;

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void detailQueriesRun() {
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("admin@music.com", "x", "ROLE_ADMIN"));
        String id =
                memberRepository.findByEmail("admin@music.com").orElseThrow().getId();

        AdminMemberDetailResponse d = service.getMemberDetail(id);

        assertEquals("admin@music.com", d.getMember().getEmail());
        assertNotNull(d.getRecentScores());
        assertTrue(d.getRecentScores().size() <= 10);
        assertTrue(d.getScoreCount() >= d.getPublicScores() + d.getPendingScores());
    }

    /** Dữ liệu mẫu V10: huong.le là chủ Ban nhạc Sao Mai (đang hoạt động); mai.ngo chỉ ở Lớp piano cô Mai (chủ đã xóa mềm). */
    @Test
    void detailListsTeamsOfMemberIncludingDeletedOnes() {
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("admin@music.com", "x", "ROLE_ADMIN"));

        var huong = service.getMemberDetail(
                memberRepository.findByEmail("huong.le@music.com").orElseThrow().getId());
        var band = huong.getTeams().stream()
                .filter(t -> t.getName().equals("Ban nhạc Sao Mai"))
                .findFirst()
                .orElseThrow();
        assertEquals("OWNER", band.getRole());
        assertEquals(5, band.getMemberCount());
        assertEquals(null, band.getDeletedAt());

        var mai = service.getMemberDetail(
                memberRepository.findByEmail("mai.ngo@music.com").orElseThrow().getId());
        assertTrue(mai.getTeams().stream()
                .anyMatch(t -> t.getName().equals("Lớp piano cô Mai") && t.getDeletedAt() != null));
        // Team đang hoạt động xếp trước team đã xóa
        boolean seenDeleted = false;
        for (var t : mai.getTeams()) {
            if (t.getDeletedAt() != null) seenDeleted = true;
            else assertTrue(!seenDeleted);
        }

        // Người chưa ở team nào thì danh sách rỗng (không null)
        var nam = service.getMemberDetail(
                memberRepository.findByEmail("nam.do@music.com").orElseThrow().getId());
        assertTrue(nam.getTeams().isEmpty());
    }

    @Test
    void purchaseTotalsMatchPurchaseList() {
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("admin@music.com", "x", "ROLE_ADMIN"));
        // Ưu tiên người đã có đơn thanh toán để câu tổng tiền/danh sách chạy trên dữ liệu thật; DB trống thì dùng admin
        String id = entityManager
                .createQuery(
                        "select o.member.id from PaymentOrder o where o.status = 'PAID' order by o.paidAt desc",
                        String.class)
                .setMaxResults(1)
                .getResultList()
                .stream()
                .findFirst()
                .orElseGet(() -> memberRepository
                        .findByEmail("admin@music.com")
                        .orElseThrow()
                        .getId());

        AdminMemberDetailResponse d = service.getMemberDetail(id);

        assertNotNull(d.getPurchases());
        assertTrue(d.getPurchases().size() <= 50);
        assertTrue(d.getPurchases().stream().allMatch(p -> p.getPaidAt() != null));
        if (d.getPurchaseCount() + d.getRefundedCount() <= 50) {
            assertEquals(
                    d.getPurchaseCount() + d.getRefundedCount(),
                    d.getPurchases().size());
            assertEquals(
                    d.getPurchaseTotal(),
                    d.getPurchases().stream()
                            .filter(p -> "PAID".equals(p.getStatus()))
                            .mapToLong(AdminMemberDetailResponse.Purchase::getAmount)
                            .sum());
        }
    }
}
