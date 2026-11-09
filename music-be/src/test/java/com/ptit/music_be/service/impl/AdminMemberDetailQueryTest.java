package com.ptit.music_be.service.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.dto.response.AdminMemberDetailResponse;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.service.AdminMemberService;

/** Chạy các câu JPQL của chi tiết thành viên với DB thật (cần MySQL đang chạy). */
@SpringBootTest
class AdminMemberDetailQueryTest {

    @Autowired
    AdminMemberService service;

    @Autowired
    MemberRepository memberRepository;

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void detailQueriesRun() {
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("admin@music.com", "x", "ROLE_ADMIN"));
        String id = memberRepository.findByEmail("admin@music.com").orElseThrow().getId();

        AdminMemberDetailResponse d = service.getMemberDetail(id);

        assertEquals("admin@music.com", d.getMember().getEmail());
        assertNotNull(d.getRecentScores());
        assertTrue(d.getRecentScores().size() <= 10);
        assertTrue(d.getScoreCount() >= d.getPublicScores() + d.getPendingScores());
    }
}
