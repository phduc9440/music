package com.ptit.music_be.service.score.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.notification.NotificationType;
import com.ptit.music_be.dto.enums.score.CommentStatus;
import com.ptit.music_be.dto.enums.score.SharePermission;
import com.ptit.music_be.dto.request.score.ScoreCommentReplyRequest;
import com.ptit.music_be.dto.request.score.ScoreCommentRequest;
import com.ptit.music_be.dto.request.score.ScoreCommentUpdateRequest;
import com.ptit.music_be.dto.response.score.ScoreCommentResponse;
import com.ptit.music_be.dto.response.score.ScoreCommentsResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.MemberScore;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.score.MemberScoreRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.service.score.ScoreCommentService;

/**
 * Góp ý gắn vào ô nhịp (mục 4.2) với DB thật, mỗi test rollback. Bản nhạc riêng tư 32 ô của OWNER, chia sẻ REVIEWER (nhận
 * xét) và VIEWER (chỉ xem); STRANGER không có quyền gì.
 */
@SpringBootTest
@Transactional
class ScoreCommentServiceImplTest {

    static final String OWNER = "user@music.com";
    static final String REVIEWER = "huong.le@music.com";
    static final String VIEWER = "an.vo@music.com";
    static final String STRANGER = "duy.pham@music.com";

    @Autowired
    ScoreCommentService commentService;

    @Autowired
    ScoreRepository scoreRepository;

    @Autowired
    MemberRepository memberRepository;

    @Autowired
    MemberScoreRepository memberScoreRepository;

    @PersistenceContext
    EntityManager em;

    String scoreId;

    @BeforeEach
    void setUp() {
        Score score = scoreRepository.save(Score.builder()
                .member(member(OWNER))
                .title("Bài góp ý thử")
                .visibility("PRIVATE")
                .measureCount(32)
                .currentVersion(3)
                .build());
        scoreId = score.getId();
        share(score, REVIEWER, SharePermission.REVIEW);
        share(score, VIEWER, SharePermission.VIEW);
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private Member member(String email) {
        return memberRepository.findByEmail(email).orElseThrow();
    }

    private void share(Score score, String email, SharePermission permission) {
        memberScoreRepository.save(MemberScore.builder()
                .score(score)
                .member(member(email))
                .permission(permission)
                .build());
    }

    private static void as(String email) {
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(email, "x", "ROLE_USER"));
    }

    private static ErrorCode codeOf(Runnable action) {
        return assertThrows(AppException.class, action::run).getErrorCode();
    }

    private long notifications(String email, NotificationType type) {
        return em.createQuery(
                        "select count(n) from Notification n where n.recipient.email = :e and n.type = :t", Long.class)
                .setParameter("e", email)
                .setParameter("t", type)
                .getSingleResult();
    }

    private ScoreCommentRequest comment(String content, Integer start, Integer end, String... mentionIds) {
        return ScoreCommentRequest.builder()
                .content(content)
                .startMeasure(start)
                .endMeasure(end)
                .mentionIds(List.of(mentionIds))
                .build();
    }

    /** Kịch bản "Xong khi" của đặc tả: góp ý và trả lời nhau trên ô 12–16, @nhắc tên có thông báo, thêm ô thì báo phiên bản cũ. */
    @Test
    void twoAccountsCommentAndReplyOnMeasures12to16WithMentionsAndOutdatedLabel() {
        String reviewerId = member(REVIEWER).getId();
        String viewerId = member(VIEWER).getId();

        // Chủ góp ý ô 12–16, nhắc người nhận xét
        as(OWNER);
        ScoreCommentResponse root =
                commentService.create(scoreId, comment("  Đoạn này hạ tông được không?  ", 12, 16, reviewerId));
        assertEquals("Đoạn này hạ tông được không?", root.getContent());
        assertEquals(12, root.getStartMeasure());
        assertEquals(16, root.getEndMeasure());
        assertEquals(3, root.getScoreVersion());
        assertEquals(CommentStatus.OPEN, root.getStatus());
        assertFalse(root.isOutdated());
        assertEquals(reviewerId, root.getMentions().get(0).getId());
        assertEquals(1, notifications(REVIEWER, NotificationType.COMMENT_MENTION));

        // Người nhận xét trả lời và nhắc người chỉ xem: chủ nhận COMMENT_REPLY, người chỉ xem nhận COMMENT_MENTION
        as(REVIEWER);
        ScoreCommentResponse thread = commentService.reply(
                root.getId(), ScoreCommentReplyRequest.builder().content("Hạ một cung nhé").mentionIds(List.of(viewerId)).build());
        assertEquals(1, thread.getReplies().size());
        assertEquals(1, notifications(OWNER, NotificationType.COMMENT_REPLY));
        assertEquals(1, notifications(VIEWER, NotificationType.COMMENT_MENTION));
        assertEquals(0, notifications(REVIEWER, NotificationType.COMMENT_REPLY)); // không tự báo cho mình

        // Chủ trả lời tiếp (trả lời vào trả lời thì gắn về góp ý gốc): người nhận xét đã tham gia nhận COMMENT_REPLY
        as(OWNER);
        thread = commentService.reply(
                thread.getReplies().get(0).getId(), ScoreCommentReplyRequest.builder().content("Ok").build());
        assertEquals(2, thread.getReplies().size());
        assertEquals(root.getId(), thread.getReplies().get(1).getParentId());
        assertEquals(1, notifications(REVIEWER, NotificationType.COMMENT_REPLY));

        // Người chỉ xem thấy luồng ở bộ lọc "Nhắc tới tôi" nhưng không viết được
        as(VIEWER);
        ScoreCommentsResponse mine = commentService.list(scoreId, null, true);
        assertFalse(mine.isCanComment());
        assertEquals(1, mine.getMentionedCount());
        assertEquals(1, mine.getComments().size());

        // Thêm 2 ô ở đầu bài: góp ý giữ ô 12–16 và version 3, báo đã lệch phiên bản
        Score score = scoreRepository.findById(scoreId).orElseThrow();
        score.setMeasureCount(34);
        score.setCurrentVersion(4);
        scoreRepository.saveAndFlush(score);
        ScoreCommentResponse after = commentService.list(scoreId, null, false).getComments().get(0);
        assertTrue(after.isOutdated());
        assertEquals(3, after.getScoreVersion());
        assertEquals(12, after.getStartMeasure());
    }

    @Test
    void permissionsForWritingResolvingEditingAndDeleting() {
        as(VIEWER);
        assertEquals(ErrorCode.COMMENT_WRITE_FORBIDDEN, codeOf(() -> commentService.create(scoreId, comment("x", 1, 1))));
        as(STRANGER);
        assertEquals(ErrorCode.UNAUTHORIZED, codeOf(() -> commentService.list(scoreId, null, false)));

        as(REVIEWER);
        ScoreCommentResponse root = commentService.create(scoreId, comment("Ô 3 thiếu dấu lặng", 3, null));
        assertEquals(3, root.getEndMeasure()); // bỏ trống ô kết thúc = góp ý một ô
        assertTrue(root.isCanEdit());
        assertTrue(root.isCanResolve());

        // Chủ không sửa được nội dung của người khác nhưng đánh dấu đã xử lý và xóa được
        as(OWNER);
        ScoreCommentResponse ownerView = commentService.list(scoreId, null, false).getComments().get(0);
        assertFalse(ownerView.isCanEdit());
        assertTrue(ownerView.isCanDelete());
        assertEquals(
                ErrorCode.COMMENT_FORBIDDEN,
                codeOf(() -> commentService.update(
                        root.getId(), ScoreCommentUpdateRequest.builder().content("sửa hộ").build())));
        ScoreCommentResponse resolved = commentService.update(
                root.getId(), ScoreCommentUpdateRequest.builder().status(CommentStatus.RESOLVED).build());
        assertEquals(CommentStatus.RESOLVED, resolved.getStatus());
        assertEquals(member(OWNER).getId(), resolved.getResolvedBy().getId());
        assertNotNull(resolved.getResolvedAt());

        ScoreCommentsResponse counts = commentService.list(scoreId, CommentStatus.OPEN, false);
        assertEquals(0, counts.getOpenCount());
        assertEquals(1, counts.getResolvedCount());
        assertTrue(counts.getComments().isEmpty());

        // Người viết sửa nội dung (có nhãn đã sửa) và mở lại
        as(REVIEWER);
        ScoreCommentResponse edited = commentService.update(
                root.getId(),
                ScoreCommentUpdateRequest.builder().content("Ô 3 thiếu dấu lặng đen").status(CommentStatus.OPEN).build());
        assertEquals("Ô 3 thiếu dấu lặng đen", edited.getContent());
        assertNotNull(edited.getEditedAt());
        assertEquals(CommentStatus.OPEN, edited.getStatus());
        assertNull(edited.getResolvedBy());

        // Người chỉ xem không xóa được; chủ xóa góp ý gốc thì trả lời mất theo
        commentService.reply(root.getId(), ScoreCommentReplyRequest.builder().content("bổ sung").build());
        as(VIEWER);
        assertEquals(ErrorCode.COMMENT_FORBIDDEN, codeOf(() -> commentService.delete(root.getId())));
        as(OWNER);
        commentService.delete(root.getId());
        em.flush();
        em.clear();
        assertEquals(
                0L,
                em.createQuery("select count(c) from ScoreComment c where c.score.id = :s", Long.class)
                        .setParameter("s", scoreId)
                        .getSingleResult());
    }

    @Test
    void validatesContentMeasuresAndMentions() {
        as(OWNER);
        assertEquals(ErrorCode.COMMENT_CONTENT_INVALID, codeOf(() -> commentService.create(scoreId, comment("   ", 1, 2))));
        assertEquals(
                ErrorCode.COMMENT_CONTENT_INVALID,
                codeOf(() -> commentService.create(scoreId, comment("a".repeat(2001), 1, 2))));
        assertEquals(ErrorCode.COMMENT_MEASURE_INVALID, codeOf(() -> commentService.create(scoreId, comment("x", 0, 2))));
        assertEquals(ErrorCode.COMMENT_MEASURE_INVALID, codeOf(() -> commentService.create(scoreId, comment("x", 5, 4))));
        assertEquals(ErrorCode.COMMENT_MEASURE_INVALID, codeOf(() -> commentService.create(scoreId, comment("x", 30, 33))));
        // Người không xem được bản nhạc thì không nhắc được
        String strangerId = member(STRANGER).getId();
        assertEquals(
                ErrorCode.COMMENT_MENTION_INVALID,
                codeOf(() -> commentService.create(scoreId, comment("x", 1, 2, strangerId))));
        // Gợi ý @nhắc tên: người được chia sẻ, không có chính mình và người ngoài
        var names = commentService.mentionable(scoreId, null).stream().map(m -> m.getId()).toList();
        assertTrue(names.contains(member(REVIEWER).getId()));
        assertTrue(names.contains(member(VIEWER).getId()));
        assertFalse(names.contains(member(OWNER).getId()));
        assertFalse(names.contains(strangerId));
        assertEquals(1, commentService.mentionable(scoreId, "hương").size());

        // Bản chưa có ô nhịp (chưa có MusicXML) thì chưa góp ý được
        Score score = scoreRepository.findById(scoreId).orElseThrow();
        score.setMeasureCount(null);
        scoreRepository.saveAndFlush(score);
        assertFalse(commentService.list(scoreId, null, false).isCanComment());
        assertEquals(ErrorCode.COMMENT_MEASURE_INVALID, codeOf(() -> commentService.create(scoreId, comment("x", 1, 1))));
    }
}
