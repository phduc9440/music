package com.ptit.music_be.service.admin.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.dto.response.admin.AdminDashboardResponse;
import com.ptit.music_be.service.admin.AdminDashboardService;

/** Chạy các câu JPQL của dashboard với DB thật (giống MusicBeApplicationTests, cần MySQL đang chạy). */
@SpringBootTest
class AdminDashboardServiceImplTest {

    @Autowired
    AdminDashboardService service;

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void dashboardQueriesRunAndFillEveryDay() {
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("admin@music.com", "x", "ROLE_ADMIN"));

        AdminDashboardResponse r = service.getDashboard(30);

        assertEquals(30, r.getDays());
        assertEquals(30, r.getScoresByDay().size());
        assertEquals(30, r.getPracticeByDay().size());
        assertEquals(30, r.getMembersByDay().size());
        assertTrue(r.getMembersWithoutDate() >= 0);
        assertNotNull(r.getTotals());
        assertTrue(r.getTotals().getMembers() >= r.getTotals().getAdmins());
        assertEquals(
                r.getTotals().getMembers(),
                r.getTotals().getActiveMembers() + r.getTotals().getLockedMembers());
        assertEquals(
                r.getTotals().getScores(),
                r.getScoresByVisibility().stream().mapToLong(k -> k.getCount()).sum());
        assertEquals(30, r.getRevenueByDay().size());
        assertNotNull(r.getBilling());
        assertEquals(
                r.getBilling().getRevenue(),
                r.getRevenueByDay().stream().mapToLong(d -> d.getAmount()).sum());
        assertEquals(
                r.getBilling().getActiveSubscriptions(),
                r.getSubscriptionsByPlan().stream().mapToLong(k -> k.getCount()).sum());
        assertEquals(
                r.getBilling().getActiveSubscriptions(),
                r.getSubscriptionsBySource().stream()
                        .mapToLong(k -> k.getCount())
                        .sum());
        assertTrue(r.getBilling().getSubscribedMembers() <= r.getBilling().getActiveSubscriptions());
        assertEquals(7, service.getDashboard(1).getDays());
    }
}
