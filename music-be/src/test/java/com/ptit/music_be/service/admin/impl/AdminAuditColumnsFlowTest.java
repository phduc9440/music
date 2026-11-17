package com.ptit.music_be.service.admin.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.dto.enums.auth.MemberStatus;
import com.ptit.music_be.dto.enums.score.SharePermission;
import com.ptit.music_be.dto.request.admin.AdminUpdateMemberRequest;
import com.ptit.music_be.dto.response.admin.AdminActivityResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.service.admin.AdminActivityService;
import com.ptit.music_be.service.admin.AdminMemberService;
import com.ptit.music_be.service.score.ScoreSharingService;

/**
 * Nhật ký quản trị cho khóa / mở khóa, cấp vai trò, cấp quyền chia sẻ (cần MySQL có seed). Không có bảng nhật ký: sự
 * kiện suy ra từ cột người làm / lúc làm trên dòng gốc. Test trả mọi thứ về như cũ sau khi chạy.
 */
@SpringBootTest
class AdminAuditColumnsFlowTest {

    static final String SUPER = "admin@music.com";
    static final String TARGET = "mai.ngo@music.com";
    static final String GRANTEE = "lan.nguyen@music.com";

    @Autowired
    AdminMemberService adminMemberService;

    @Autowired
    AdminActivityService activityService;

    @Autowired
    ScoreSharingService sharingService;

    @Autowired
    MemberRepository memberRepository;

    @Autowired
    ScoreRepository scoreRepository;

    @Autowired
    JdbcTemplate jdbc;

    Member target;
    Member admin;
    Score sharedScore;

    @BeforeEach
    void setUp() {
        target = memberRepository.findByEmail(TARGET).orElse(null);
        admin = memberRepository.findByEmail(SUPER).orElse(null);
        Assumptions.assumeTrue(target != null && admin != null, "cần seed V3 (admin@music.com, mai.ngo@music.com)");
        Assumptions.assumeTrue(target.getStatus() == MemberStatus.ACTIVE, "mai.ngo@music.com phải đang hoạt động");
    }

    @AfterEach
    void restore() {
        SecurityContextHolder.clearContext();
        if (target == null) return;
        jdbc.update(
                "UPDATE members SET status = 1, status_changed_at = NULL, status_changed_by = NULL, status_reason = NULL"
                        + " WHERE id = ?",
                target.getId());
        jdbc.update(
                "DELETE mr FROM member_roles mr JOIN roles r ON r.id = mr.role_id WHERE mr.member_id = ? AND r.name <> 'USER'",
                target.getId());
        if (sharedScore != null) {
            jdbc.update(
                    "DELETE ms FROM member_scores ms JOIN members m ON m.id = ms.member_id"
                            + " WHERE ms.score_id = ? AND m.email = ?",
                    sharedScore.getId(),
                    GRANTEE);
        }
    }

    private static void loginAs(String email, String role) {
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(email, "x", role));
    }

    private List<AdminActivityResponse> events(String type) {
        return activityService.search(0, 100, null, type, null, null, null).getContent();
    }

    private boolean hasEvent(String type, String targetId) {
        return events(type).stream().anyMatch(e -> targetId.equals(e.getTargetId()));
    }

    @Test
    void lockAndUnlockKeepLatestActorTimeAndReason() {
        loginAs(SUPER, "ROLE_SUPER_ADMIN");
        adminMemberService.updateMember(
                target.getId(),
                AdminUpdateMemberRequest.builder()
                        .status(MemberStatus.INACTIVE)
                        .statusReason("  spam liên tục  ")
                        .build());

        AdminActivityResponse locked = events("MEMBER_LOCKED").stream()
                .filter(e -> target.getId().equals(e.getTargetId()))
                .findFirst()
                .orElseThrow();
        assertEquals(SUPER, locked.getActorEmail());
        assertEquals(TARGET, locked.getTargetLabel());
        assertEquals("spam liên tục", locked.getDetail());

        // Gửi lại đúng trạng thái đang có thì không ghi đè người làm / lý do
        adminMemberService.updateMember(
                target.getId(),
                AdminUpdateMemberRequest.builder()
                        .status(MemberStatus.INACTIVE)
                        .statusReason("khác")
                        .build());
        assertEquals(
                "spam liên tục",
                jdbc.queryForObject("SELECT status_reason FROM members WHERE id = ?", String.class, target.getId()));

        adminMemberService.updateMember(
                target.getId(),
                AdminUpdateMemberRequest.builder().status(MemberStatus.ACTIVE).build());
        // Chỉ giữ lần đổi gần nhất: mở khóa thay cho dòng khóa
        assertTrue(hasEvent("MEMBER_UNLOCKED", target.getId()));
        assertFalse(hasEvent("MEMBER_LOCKED", target.getId()));
        assertNull(events("MEMBER_UNLOCKED").stream()
                .filter(e -> target.getId().equals(e.getTargetId()))
                .findFirst()
                .orElseThrow()
                .getDetail());
    }

    @Test
    void grantedRoleShowsAndAutoAssignedRolesDoNot() {
        loginAs(SUPER, "ROLE_SUPER_ADMIN");
        assertFalse(hasEvent("ROLE_GRANTED", target.getId()), "vai trò USER gán lúc đăng ký không hiện");

        adminMemberService.updateMember(
                target.getId(),
                AdminUpdateMemberRequest.builder().roles(Set.of("USER", "ADMIN")).build());

        AdminActivityResponse granted = events("ROLE_GRANTED").stream()
                .filter(e -> target.getId().equals(e.getTargetId()))
                .findFirst()
                .orElseThrow();
        assertEquals(SUPER, granted.getActorEmail());
        assertTrue(granted.getDetail() != null && !granted.getDetail().isBlank());

        // Thu hồi thì dòng member_roles bị xóa, sự kiện cấp cũng biến mất (đã chấp nhận khi chọn cách thêm cột)
        adminMemberService.updateMember(
                target.getId(), AdminUpdateMemberRequest.builder().roles(Set.of("USER")).build());
        assertFalse(hasEvent("ROLE_GRANTED", target.getId()));
    }

    @Test
    void sharingKeepsLatestGrantorAndLevel() {
        Member grantee = memberRepository.findByEmail(GRANTEE).orElse(null);
        Assumptions.assumeTrue(grantee != null, "cần seed lan.nguyen@music.com");
        sharedScore = scoreRepository.findAll().stream()
                .filter(s -> s.getMember() != null
                        && !Boolean.TRUE.equals(s.getIsOfficial())
                        && !s.getMember().getId().equals(grantee.getId())
                        && !s.getMember().getId().equals(admin.getId()))
                .findFirst()
                .orElse(null);
        Assumptions.assumeTrue(sharedScore != null, "cần một bản nhạc của người dùng thường");
        jdbc.update(
                "DELETE FROM member_scores WHERE score_id = ? AND member_id = ?", sharedScore.getId(), grantee.getId());
        String ownerEmail = memberRepository
                .findById(sharedScore.getMember().getId())
                .orElseThrow()
                .getEmail();

        loginAs(ownerEmail, "ROLE_USER");
        sharingService.addMember(sharedScore.getId(), GRANTEE, SharePermission.VIEW);
        sharingService.updateMember(sharedScore.getId(), grantee.getId(), SharePermission.EDIT);

        // Admin không cấp chia sẻ được trên bản người dùng: sự kiện là việc của chủ, chỉ giữ lần đổi gần nhất
        loginAs(SUPER, "ROLE_SUPER_ADMIN");
        List<AdminActivityResponse> rows = events("SHARE_GRANTED").stream()
                .filter(e -> sharedScore.getId().equals(e.getTargetId()) && e.getDetail().startsWith(GRANTEE))
                .toList();
        assertEquals(1, rows.size());
        assertEquals(ownerEmail, rows.get(0).getActorEmail());
        assertEquals(GRANTEE + ": EDIT", rows.get(0).getDetail());

        // Thu hồi thì dòng chia sẻ bị xóa nên sự kiện cũng mất
        loginAs(ownerEmail, "ROLE_USER");
        sharingService.removeMember(sharedScore.getId(), grantee.getId());
        loginAs(SUPER, "ROLE_SUPER_ADMIN");
        assertFalse(events("SHARE_GRANTED").stream()
                .anyMatch(e -> sharedScore.getId().equals(e.getTargetId()) && e.getDetail().startsWith(GRANTEE)));
    }
}
