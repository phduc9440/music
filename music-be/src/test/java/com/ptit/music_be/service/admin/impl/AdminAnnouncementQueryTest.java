package com.ptit.music_be.service.admin.impl;

import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import com.ptit.music_be.dto.enums.MemberStatus;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.repository.MemberRepository;

/** Chạy các câu JPQL chọn người nhận thông báo chung với DB thật (cần MySQL đang chạy). */
@SpringBootTest
class AdminAnnouncementQueryTest {

    @Autowired
    MemberRepository memberRepository;

    @Test
    void audienceQueriesRun() {
        var all = memberRepository.findAllByStatus(MemberStatus.ACTIVE);
        var nonAdmins = memberRepository.findNonAdminsByStatus(MemberStatus.ACTIVE);
        var admins = memberRepository.findAllAdmins();

        assertTrue(all.size() >= nonAdmins.size());
        assertTrue(nonAdmins.stream()
                .noneMatch(m -> admins.stream().map(Member::getId).anyMatch(m.getId()::equals)));
    }
}
