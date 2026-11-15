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

import com.ptit.music_be.dto.enums.auth.AppLocale;
import com.ptit.music_be.dto.request.auth.UpdateLocaleRequest;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.service.auth.MemberService;

/** Lưu ngôn ngữ giao diện (VI / EN) vào cột members.locale (cần MySQL đang chạy, schema ở V1). */
@SpringBootTest
@Transactional
class MemberLocaleTest {

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
                .email("zzlocale" + UUID.randomUUID().toString().substring(0, 8) + "@test.local")
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
        assertNull(memberService.getMyInfo().getLocale());
    }

    @Test
    void theChosenLanguageIsSavedAndComesBackWithTheProfile() {
        assertEquals(
                AppLocale.EN,
                memberService
                        .updateMyLocale(new UpdateLocaleRequest(AppLocale.EN))
                        .getLocale());

        entityManager.flush();
        entityManager.clear();

        assertEquals(AppLocale.EN, memberService.getMyInfo().getLocale());
        assertEquals(
                AppLocale.EN,
                memberRepository.findById(member.getId()).orElseThrow().getLocale());
    }

    @Test
    void theChoiceCanBeSwitchedBack() {
        memberService.updateMyLocale(new UpdateLocaleRequest(AppLocale.EN));
        memberService.updateMyLocale(new UpdateLocaleRequest(AppLocale.VI));

        assertEquals(AppLocale.VI, memberService.getMyInfo().getLocale());
    }
}
