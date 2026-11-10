package com.ptit.music_be.service.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.dto.response.PageResponse;
import com.ptit.music_be.dto.response.ScoreSummaryResponse;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.service.ScoreService;

/** Chạy câu JPQL lọc/sắp xếp của trang quản lý bản nhạc với DB thật (cần MySQL đang chạy). */
@SpringBootTest
class AdminScoreSearchQueryTest {

    @Autowired
    ScoreService scoreService;

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private void asAdmin() {
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("admin@music.com", "x", "ROLE_ADMIN"));
    }

    @Test
    void filtersAndSortsRun() {
        asAdmin();
        PageResponse<ScoreSummaryResponse> all = scoreService.getAllForAdmin(0, 20, null, null, null, null, null, null);
        PageResponse<ScoreSummaryResponse> official =
                scoreService.getAllForAdmin(0, 20, null, null, "true", null, null, "TITLE");
        PageResponse<ScoreSummaryResponse> notOfficial =
                scoreService.getAllForAdmin(0, 20, null, null, "false", null, null, "VIEWS");

        assertEquals(all.getTotalElements(), official.getTotalElements() + notOfficial.getTotalElements());
        assertTrue(official.getContent().stream().allMatch(s -> Boolean.TRUE.equals(s.getIsOfficial())));
        assertTrue(notOfficial.getContent().stream().noneMatch(s -> Boolean.TRUE.equals(s.getIsOfficial())));
        scoreService.getAllForAdmin(0, 20, null, "PUBLIC", null, "OMR", "EASY", "CREATED");
    }

    @Test
    void invalidFilterValuesAreRejected() {
        asAdmin();
        assertThrows(
                AppException.class, () -> scoreService.getAllForAdmin(0, 20, null, null, "maybe", null, null, null));
        assertThrows(
                AppException.class, () -> scoreService.getAllForAdmin(0, 20, null, null, null, null, null, "RANDOM"));
        assertThrows(
                AppException.class, () -> scoreService.getAllForAdmin(0, 20, null, null, null, "WRONG", null, null));
    }
}
