package com.ptit.music_be.service.team;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Collection;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import com.ptit.music_be.dto.enums.team.ShowItemStatus;
import com.ptit.music_be.dto.enums.team.TeamPermission;
import com.ptit.music_be.dto.enums.team.TeamRole;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.ShowItem;

/**
 * Bảng luật chuyển trạng thái bài trong show với quyền mặc định của từng vai trò: mỗi dòng là (vai trò trong team, quan hệ
 * với bài, từ, các đích được phép).
 */
class ShowItemTransitionsTest {

    static final String ARRANGER = "arr";
    static final String REVIEWER = "rev";
    static final String OTHER = "other";

    private static ShowItem item(ShowItemStatus status) {
        return ShowItem.builder()
                .status(status)
                .arranger(Member.builder().id(ARRANGER).build())
                .reviewer(Member.builder().id(REVIEWER).build())
                .build();
    }

    private static Set<ShowItemStatus> parse(String list) {
        Set<ShowItemStatus> set = EnumSet.noneOf(ShowItemStatus.class);
        if (list != null && !list.isBlank()) {
            for (String s : list.split(" ")) {
                set.add(ShowItemStatus.valueOf(s));
            }
        }
        return set;
    }

    private static Set<ShowItemStatus> allowed(ShowItem item, RolePermissions perms, String who) {
        return set(ShowItemTransitions.allowed(item, perms, who));
    }

    private static Set<ShowItemStatus> set(List<ShowItemStatus> list) {
        Collection<ShowItemStatus> c = list.isEmpty() ? EnumSet.noneOf(ShowItemStatus.class) : list;
        return EnumSet.copyOf(c);
    }

    @ParameterizedTest(name = "{0} {1} từ {2} -> [{3}]")
    @CsvSource({
        // người phối
        "ARRANGER, arr, TODO, ARRANGING",
        "ARRANGER, arr, ARRANGING, TODO IN_REVIEW",
        "ARRANGER, arr, IN_REVIEW, ARRANGING",
        "ARRANGER, arr, APPROVED, ''",
        // người duyệt
        "ARRANGER, rev, TODO, ''",
        "ARRANGER, rev, ARRANGING, ''",
        "ARRANGER, rev, IN_REVIEW, APPROVED ARRANGING",
        "ARRANGER, rev, APPROVED, IN_REVIEW",
        // thành viên không được giao bài này
        "ARRANGER, other, ARRANGING, ''",
        "VIEWER, other, IN_REVIEW, ''",
        // quản lý kéo tự do, trừ duyệt bài đã giao cho người khác duyệt
        "MANAGER, other, TODO, ARRANGING IN_REVIEW",
        "MANAGER, other, IN_REVIEW, TODO ARRANGING",
        "MANAGER, rev, IN_REVIEW, TODO ARRANGING APPROVED",
        "MANAGER, rev, TODO, ARRANGING IN_REVIEW APPROVED",
        // bài đã duyệt: chỉ người duyệt mở lại; quản lý không phải người duyệt thì không đụng được
        "MANAGER, other, APPROVED, ''",
        "MANAGER, rev, APPROVED, TODO ARRANGING IN_REVIEW",
        // chủ nhóm duyệt và mở lại được mọi bài
        "OWNER, other, TODO, ARRANGING IN_REVIEW APPROVED",
        "OWNER, other, IN_REVIEW, TODO ARRANGING APPROVED",
        "OWNER, other, APPROVED, TODO ARRANGING IN_REVIEW",
    })
    void allowedTargets(TeamRole role, String who, ShowItemStatus from, String expected) {
        assertEquals(parse(expected), allowed(item(from), RolePermissions.defaults(role), who));
    }

    @Test
    void returnByReviewerNeedsNoteButNotWhenCoordinatorOrArranger() {
        ShowItem inReview = item(ShowItemStatus.IN_REVIEW);
        RolePermissions arranger = RolePermissions.defaults(TeamRole.ARRANGER);
        assertTrue(ShowItemTransitions.isReturnByReviewer(inReview, arranger, REVIEWER, ShowItemStatus.ARRANGING));
        assertFalse(ShowItemTransitions.isReturnByReviewer(
                inReview, RolePermissions.defaults(TeamRole.MANAGER), REVIEWER, ShowItemStatus.ARRANGING));
        assertFalse(ShowItemTransitions.isReturnByReviewer(inReview, arranger, ARRANGER, ShowItemStatus.ARRANGING));
        assertFalse(ShowItemTransitions.isReturnByReviewer(inReview, arranger, REVIEWER, ShowItemStatus.APPROVED));
    }

    @Test
    void managerApprovesItemWithoutReviewer() {
        ShowItem noReviewer = ShowItem.builder()
                .status(ShowItemStatus.ARRANGING)
                .arranger(Member.builder().id(ARRANGER).build())
                .build();
        assertTrue(allowed(noReviewer, RolePermissions.defaults(TeamRole.MANAGER), OTHER)
                .contains(ShowItemStatus.APPROVED));
    }

    @Test
    void personWhoIsBothArrangerAndReviewerGetsBothSets() {
        ShowItem self = ShowItem.builder()
                .status(ShowItemStatus.IN_REVIEW)
                .arranger(Member.builder().id(OTHER).build())
                .reviewer(Member.builder().id(OTHER).build())
                .build();
        assertEquals(
                EnumSet.of(ShowItemStatus.ARRANGING, ShowItemStatus.APPROVED),
                allowed(self, RolePermissions.defaults(TeamRole.ARRANGER), OTHER));
    }

    @Test
    void approveAnyActsAsReviewerOfEveryItem() {
        // Chủ nhóm tích "Duyệt thay" cho người phối: duyệt / trả lại / mở lại mọi bài như người duyệt, nhưng không kéo
        // tự do
        RolePermissions arrangerWithApprove =
                new RolePermissions(TeamRole.ARRANGER, EnumSet.of(TeamPermission.COMMENT, TeamPermission.APPROVE_ANY));
        assertEquals(
                EnumSet.of(ShowItemStatus.APPROVED, ShowItemStatus.ARRANGING),
                allowed(item(ShowItemStatus.IN_REVIEW), arrangerWithApprove, OTHER));
        assertEquals(
                EnumSet.of(ShowItemStatus.IN_REVIEW),
                allowed(item(ShowItemStatus.APPROVED), arrangerWithApprove, OTHER));
        assertEquals(
                EnumSet.noneOf(ShowItemStatus.class), allowed(item(ShowItemStatus.TODO), arrangerWithApprove, OTHER));
    }

    @Test
    void managerWithoutShowPermissionCannotDragFreely() {
        // Chủ nhóm bỏ tích "Quản lý buổi diễn" của quản lý: quản lý chỉ còn quyền như người được giao
        RolePermissions manager = new RolePermissions(TeamRole.MANAGER, EnumSet.of(TeamPermission.EDIT_SCORES));
        assertEquals(EnumSet.noneOf(ShowItemStatus.class), allowed(item(ShowItemStatus.TODO), manager, OTHER));
        assertEquals(EnumSet.of(ShowItemStatus.ARRANGING), allowed(item(ShowItemStatus.TODO), manager, ARRANGER));
    }
}
