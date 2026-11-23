package com.ptit.music_be.service.auth.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.UUID;

import jakarta.persistence.EntityManager;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.auth.UiTheme;
import com.ptit.music_be.dto.request.auth.UpdateThemeRequest;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.service.auth.MemberService;

/** Lưu giao diện sáng/tối/theo hệ thống vào cột members.ui_theme (cần MySQL đang chạy, migration tự áp dụng). */
@SpringBootTest
@Transactional
class MemberThemeTest {

    @Autowired
    MemberService memberService;

    @Autowired
    MemberRepository memberRepository;

    @Autowired
    EntityManager entityManager;

    private Member member;

    @BeforeEach
    void seed() {
        member = memberRepository.save(Member.builder()
                .email("zztheme" + UUID.randomUUID().toString().substring(0, 8) + "@test.local")
                .build());
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(member.getEmail(), "x", "ROLE_USER"));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void newMembersHaveNoChoiceYet() {
        assertNull(memberService.getMyInfo().getUiTheme());
    }

    @Test
    void theChosenThemeIsSavedAndComesBackWithTheProfile() {
        assertEquals(
                UiTheme.DARK,
                memberService
                        .updateMyTheme(new UpdateThemeRequest(UiTheme.DARK))
                        .getUiTheme());

        entityManager.flush();
        entityManager.clear();

        assertEquals(UiTheme.DARK, memberService.getMyInfo().getUiTheme());
        assertEquals(
                UiTheme.DARK,
                memberRepository.findById(member.getId()).orElseThrow().getUiTheme());
    }

    @Test
    void theChoiceCanBeChangedBackToSystem() {
        memberService.updateMyTheme(new UpdateThemeRequest(UiTheme.LIGHT));
        memberService.updateMyTheme(new UpdateThemeRequest(UiTheme.SYSTEM));

        assertEquals(UiTheme.SYSTEM, memberService.getMyInfo().getUiTheme());
    }
}
