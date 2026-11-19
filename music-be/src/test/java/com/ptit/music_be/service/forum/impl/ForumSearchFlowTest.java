package com.ptit.music_be.service.forum.impl;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeFalse;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.service.forum.ForumService;

/** Tìm chủ đề theo từ khóa nằm trong nội dung chủ đề hoặc bài trả lời (MySQL thật, dữ liệu seed V13). */
@SpringBootTest
class ForumSearchFlowTest {

    @Autowired
    ForumService forum;

    @Autowired
    JdbcTemplate jdbc;

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private boolean found(String keyword, String threadId) {
        return forum.threads(null, keyword, ForumService.Sort.LATEST, false, false, 0, 50).getContent().stream()
                .anyMatch(t -> t.getId().equals(threadId));
    }

    @Test
    void keywordInAReplyOrInTheThreadBodyFindsTheThread() {
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("admin@music.com", "x", "ROLE_SUPER_ADMIN"));
        List<Map<String, Object>> posts = jdbc.queryForList(
                "SELECT p.thread_id AS tid, p.body AS body FROM forum_posts p WHERE p.hidden_at IS NULL LIMIT 1");
        assumeFalse(posts.isEmpty(), "cần DB đã seed diễn đàn");
        String threadId = (String) posts.get(0).get("tid");
        String body = (String) posts.get(0).get("body");
        // Một đoạn giữa nội dung bài, chắc chắn không nằm trong tiêu đề
        String fragment = body.substring(body.length() / 3, Math.min(body.length(), body.length() / 3 + 12))
                .trim();
        assumeFalse(fragment.length() < 4, "nội dung bài quá ngắn để thử");

        assertTrue(found(fragment, threadId), "tìm theo nội dung bài trả lời");

        String threadBody = jdbc.queryForObject("SELECT body FROM forum_threads WHERE id = ?", String.class, threadId);
        String threadFragment = threadBody
                .substring(threadBody.length() / 3, Math.min(threadBody.length(), threadBody.length() / 3 + 12))
                .trim();
        assumeFalse(threadFragment.length() < 4, "nội dung chủ đề quá ngắn để thử");
        assertTrue(found(threadFragment, threadId), "tìm theo nội dung chủ đề");
    }
}
