package com.ptit.music_be.service.admin.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import org.springframework.jdbc.core.JdbcTemplate;

import com.ptit.music_be.dto.enums.report.ReportReason;
import com.ptit.music_be.dto.request.admin.ForumCategoryRequest;
import com.ptit.music_be.dto.request.forum.ForumThreadRequest;
import com.ptit.music_be.dto.request.report.ReportRequest;
import com.ptit.music_be.service.report.ContentReportService;
import com.ptit.music_be.dto.request.forum.ForumPostRequest;
import com.ptit.music_be.dto.response.admin.AdminForumCategoryResponse;
import com.ptit.music_be.dto.response.admin.AdminForumThreadResponse;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.service.admin.AdminForumService;
import com.ptit.music_be.service.forum.ForumService;

/**
 * Luồng quản lý diễn đàn trên DB mẫu (chủ đề seed-ft-*, V13): chuyên mục, ẩn / khôi phục, ghim, khóa. Cần MySQL đã chạy
 * seed; mỗi thay đổi được hoàn lại sau test.
 */
@SpringBootTest
class AdminForumFlowTest {

    static final String THREAD = "seed-ft-9";
    static final String POST = "seed-fp-1-2";

    @Autowired
    AdminForumService adminForum;

    @Autowired
    ForumService forum;

    @Autowired
    ContentReportService reports;

    @Autowired
    JdbcTemplate jdbc;

    private String createdCategory;
    private String ownThread;

    private static void loginAs(String email, String role) {
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(email, "x", role));
    }

    @AfterEach
    void restore() {
        loginAs("admin@music.com", "ROLE_SUPER_ADMIN");
        try {
            adminForum.setThreadPinned(THREAD, false);
            adminForum.setThreadLocked(THREAD, false);
            adminForum.setPostHidden(POST, false);
            if (createdCategory != null) {
                adminForum.deleteCategory(createdCategory);
            }
        } catch (AppException ignored) {
            // dữ liệu mẫu không có thì không có gì để hoàn lại
        }
        if (ownThread != null) {
            jdbc.update("DELETE FROM content_reports WHERE forum_thread_id = ?", ownThread);
            jdbc.update("DELETE FROM forum_threads WHERE id = ?", ownThread);
        }
        SecurityContextHolder.clearContext();
    }

    private AdminForumThreadResponse find(String id, AdminForumService.Status status) {
        return adminForum.threads(null, null, status, 0, 100).getContent().stream()
                .filter(t -> t.getId().equals(id))
                .findFirst()
                .orElse(null);
    }

    @Test
    void categoriesCanBeCreatedRenamedAndOnlyEmptyOnesDeleted() {
        loginAs("admin@music.com", "ROLE_SUPER_ADMIN");
        AdminForumCategoryResponse created = adminForum.createCategory(
                ForumCategoryRequest.builder().name("Thử nghiệm đặc biệt").description("mô tả").build());
        createdCategory = created.getId();
        assertEquals("thu-nghiem-dac-biet", created.getSlug());
        assertEquals(0, created.getThreadCount());

        // trùng tên thì slug thêm số, không trùng đường dẫn
        AdminForumCategoryResponse twin = adminForum.createCategory(
                ForumCategoryRequest.builder().name("Thử nghiệm đặc biệt").build());
        assertEquals("thu-nghiem-dac-biet-2", twin.getSlug());
        adminForum.deleteCategory(twin.getId());

        AdminForumCategoryResponse renamed = adminForum.updateCategory(
                createdCategory, ForumCategoryRequest.builder().name("Tên mới").build());
        assertEquals("thu-nghiem-dac-biet", renamed.getSlug(), "đổi tên không đổi đường dẫn");

        AppException invalid = assertThrows(
                AppException.class, () -> adminForum.createCategory(ForumCategoryRequest.builder().name("a").build()));
        assertEquals(ErrorCode.FORUM_CATEGORY_INVALID, invalid.getErrorCode());

        // chuyên mục còn chủ đề thì không xóa được
        AdminForumCategoryResponse busy = adminForum.categories().stream()
                .filter(c -> c.getThreadCount() > 0)
                .findFirst()
                .orElse(null);
        Assumptions.assumeTrue(busy != null, "cần chuyên mục có chủ đề từ seed V13");
        AppException notEmpty = assertThrows(AppException.class, () -> adminForum.deleteCategory(busy.getId()));
        assertEquals(ErrorCode.FORUM_CATEGORY_NOT_EMPTY, notEmpty.getErrorCode());
    }

    @Test
    void hidingAThreadClosesItsReportsAndRestoringBringsItBack() {
        // Chủ đề và báo cáo do test tự tạo (không đụng báo cáo của dữ liệu mẫu), xóa sạch ở cuối
        loginAs("user@music.com", "ROLE_USER");
        String categoryId = forum.categories().get(0).getId();
        ownThread = forum.createThread(
                        ForumThreadRequest.builder()
                                .categoryId(categoryId)
                                .title("Chủ đề thử quản lý")
                                .body("nội dung thử")
                                .build())
                .getId();
        loginAs("lan.nguyen@music.com", "ROLE_USER");
        reports.reportForumThread(
                ownThread,
                ReportRequest.builder().reason(ReportReason.SPAM).details("thử").build());

        loginAs("admin@music.com", "ROLE_SUPER_ADMIN");
        AdminForumThreadResponse reported = find(ownThread, AdminForumService.Status.REPORTED);
        assertTrue(reported != null && reported.getPendingReports() == 1);
        assertFalse(reported.isHidden());

        adminForum.setThreadHidden(ownThread, true);
        AdminForumThreadResponse hidden = find(ownThread, AdminForumService.Status.HIDDEN);
        assertTrue(hidden != null && hidden.isHidden());
        assertEquals(0, hidden.getPendingReports(), "ẩn xong thì báo cáo chờ đã được đóng");
        assertEquals(null, find(ownThread, AdminForumService.Status.VISIBLE));
        // người dùng không còn thấy chủ đề
        loginAs("user@music.com", "ROLE_USER");
        AppException gone = assertThrows(AppException.class, () -> forum.thread(ownThread));
        assertEquals(ErrorCode.FORUM_THREAD_NOT_EXISTED, gone.getErrorCode());

        loginAs("admin@music.com", "ROLE_SUPER_ADMIN");
        adminForum.setThreadHidden(ownThread, false);
        assertTrue(find(ownThread, AdminForumService.Status.VISIBLE) != null);
    }

    @Test
    void pinnedThreadsComeFirstAndLockedThreadsRefuseReplies() {
        loginAs("admin@music.com", "ROLE_SUPER_ADMIN");
        Assumptions.assumeTrue(find(THREAD, AdminForumService.Status.ALL) != null, "cần seed V13");
        adminForum.setThreadPinned(THREAD, true);
        adminForum.setThreadLocked(THREAD, true);
        assertTrue(find(THREAD, AdminForumService.Status.PINNED).isPinned());
        assertTrue(find(THREAD, AdminForumService.Status.LOCKED).isLocked());

        loginAs("user@music.com", "ROLE_USER");
        var first = forum.threads(null, null, ForumService.Sort.LATEST, false, false, 0, 5)
                .getContent()
                .get(0);
        assertEquals(THREAD, first.getId(), "chủ đề ghim đứng đầu danh sách");
        assertTrue(first.isPinned() && first.isLocked());
        AppException locked = assertThrows(
                AppException.class,
                () -> forum.reply(THREAD, ForumPostRequest.builder().body("thử trả lời").build()));
        assertEquals(ErrorCode.FORUM_THREAD_LOCKED, locked.getErrorCode());
    }

    @Test
    void adminSeesHiddenRepliesAndCanRestoreThem() {
        loginAs("admin@music.com", "ROLE_SUPER_ADMIN");
        var before = adminForum.thread("seed-ft-1");
        Assumptions.assumeTrue(
                before.getPosts().stream().anyMatch(p -> p.getId().equals(POST)), "cần bài seed-fp-1-2 từ seed V13");
        adminForum.setPostHidden(POST, true);

        var after = adminForum.thread("seed-ft-1");
        assertTrue(after.getPosts().stream().filter(p -> p.getId().equals(POST)).findFirst().orElseThrow().isHidden());
        assertEquals(1, after.getThread().getHiddenReplyCount());

        loginAs("user@music.com", "ROLE_USER");
        assertTrue(forum.thread("seed-ft-1").getPosts().stream().noneMatch(p -> p.getId().equals(POST)));
    }

    @Test
    void ordinaryUsersCannotManageTheForum() {
        loginAs("user@music.com", "ROLE_USER");
        AppException e = assertThrows(AppException.class, () -> adminForum.categories());
        assertEquals(ErrorCode.UNAUTHORIZED, e.getErrorCode());
    }
}
