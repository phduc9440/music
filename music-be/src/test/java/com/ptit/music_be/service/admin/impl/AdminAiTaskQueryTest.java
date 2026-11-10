package com.ptit.music_be.service.admin.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDate;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.dto.response.AdminAiTaskResponse;
import com.ptit.music_be.dto.response.PageResponse;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.service.admin.AdminAiTaskService;

/** Chạy các câu JPQL của trang giám sát tác vụ AI với DB thật, chỉ đọc (cần MySQL đang chạy). */
@SpringBootTest
class AdminAiTaskQueryTest {

    @Autowired
    AdminAiTaskService service;

    @BeforeEach
    void asAdmin() {
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("admin@music.com", "x", "ROLE_ADMIN"));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void listWithEveryFilterRuns() {
        PageResponse<AdminAiTaskResponse> all = service.list(0, 20, null, null, null, null, null);
        PageResponse<AdminAiTaskResponse> filtered = service.list(
                0, 5, "FAILED", "OMR_CONVERSION", "a_b%", LocalDate.now().minusDays(30), LocalDate.now());

        assertTrue(all.getTotalElements() >= filtered.getTotalElements());
        assertTrue(filtered.getContent().size() <= 5);
        assertTrue(filtered.getContent().stream()
                .allMatch(t -> t.getStatus().name().equals("FAILED")));
        // dữ liệu vào/ra chỉ có ở API chi tiết
        assertTrue(all.getContent().stream().allMatch(t -> t.getInputData() == null && t.getResultData() == null));
        all.getContent().stream()
                .findFirst()
                .ifPresent(
                        t -> assertEquals(t.getId(), service.detail(t.getId()).getId()));
    }

    @Test
    void summaryRuns() {
        AdminAiTaskResponse.Summary s = service.summary();
        assertNotNull(s.getAverageRunSeconds());
        assertTrue(s.getPending() >= 0 && s.getProcessing() >= 0);
    }

    @Test
    void invalidFiltersAreRejected() {
        assertThrows(AppException.class, () -> service.list(0, 20, "DONE", null, null, null, null));
        assertThrows(AppException.class, () -> service.list(0, 20, null, "VIDEO", null, null, null));
    }
}
