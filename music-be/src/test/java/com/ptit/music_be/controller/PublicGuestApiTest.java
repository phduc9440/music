package com.ptit.music_be.controller;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Khách chưa đăng nhập (không có token) đọc được Khám phá, trang một bản công khai, bảng giá và diễn đàn, nhưng không
 * làm được việc cần tài khoản. Cần MySQL đã chạy seed (bản PUBLIC, chủ đề diễn đàn V13).
 */
@SpringBootTest
@AutoConfigureMockMvc
class PublicGuestApiTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void guestCanBrowsePublicScores() throws Exception {
        mvc.perform(get("/api/public/scores").param("size", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.content").isArray())
                // không lộ email chủ sở hữu
                .andExpect(jsonPath("$.result.content[0].ownerEmail").doesNotExist());
        mvc.perform(get("/api/public/scores").param("sort", "VIEWS").param("keyword", "a"))
                .andExpect(status().isOk());
        // bộ lọc thể loại của trang Khám phá cho khách
        mvc.perform(get("/api/public/scores/tags"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").isArray());
    }

    @Test
    void guestSeesOnePublicScoreButNotAPrivateOne() throws Exception {
        String publicId = firstId("PUBLIC");
        Assumptions.assumeTrue(publicId != null, "cần một bản PUBLIC trong DB mẫu");
        mvc.perform(get("/api/public/scores/" + publicId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.id").value(publicId))
                .andExpect(jsonPath("$.result.ownerEmail").doesNotExist());

        String privateId = firstId("PRIVATE");
        Assumptions.assumeTrue(privateId != null, "cần một bản PRIVATE trong DB mẫu");
        mvc.perform(get("/api/public/scores/" + privateId)).andExpect(status().isNotFound());
        mvc.perform(get("/api/public/scores/khong-co-bai-nay")).andExpect(status().isNotFound());
    }

    @Test
    void guestCanReadThePricingAndTheForum() throws Exception {
        mvc.perform(get("/api/public/plans")).andExpect(status().isOk());
        mvc.perform(get("/api/public/forum/categories"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").isArray());

        String threads = mvc.perform(get("/api/public/forum/threads").param("size", "5"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        // khách không có dấu cá nhân và không thấy email tác giả
        assertFalse(threads.contains("\"myReaction\":\""));
        assertFalse(threads.contains("\"mine\":true"));
        assertFalse(threads.contains("@music.com"));

        String threadId = jdbc.query(
                "SELECT id FROM forum_threads WHERE hidden_at IS NULL LIMIT 1",
                rs -> rs.next() ? rs.getString(1) : null);
        Assumptions.assumeTrue(threadId != null, "cần chủ đề diễn đàn từ seed V13");
        String detail = mvc.perform(get("/api/public/forum/threads/" + threadId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.thread.id").value(threadId))
                .andReturn()
                .getResponse()
                .getContentAsString();
        assertFalse(detail.contains("@music.com"));
        assertTrue(detail.contains("\"thread\""));
    }

    @Test
    void guestStillCannotUseTheAuthenticatedApis() throws Exception {
        mvc.perform(get("/api/forum/threads")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/forum/threads")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"abc\",\"body\":\"x\"}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/scores/public")).andExpect(status().isUnauthorized());
    }

    private String firstId(String visibility) {
        return jdbc.query(
                "SELECT id FROM scores WHERE visibility = ? AND deleted_at IS NULL LIMIT 1",
                rs -> rs.next() ? rs.getString(1) : null,
                visibility);
    }
}
