package com.ptit.music_be.service.team;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.EnumSet;
import java.util.Set;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.api.Test;

import com.ptit.music_be.dto.enums.ShowItemStatus;
import com.ptit.music_be.dto.enums.TeamRole;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.ShowItem;

/** Bảng luật chuyển trạng thái bài trong show: mỗi dòng là (vai trò trong team, quan hệ với bài, từ, các đích được phép). */
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
        // quản lý kéo tự do
        "MANAGER, other, TODO, ARRANGING IN_REVIEW APPROVED",
        "OWNER, other, APPROVED, TODO ARRANGING IN_REVIEW",
    })
    void allowedTargets(TeamRole role, String who, ShowItemStatus from, String expected) {
        assertEquals(parse(expected), EnumSet.copyOf(withNone(ShowItemTransitions.allowed(item(from), role, who))));
    }

    private static java.util.Collection<ShowItemStatus> withNone(java.util.List<ShowItemStatus> list) {
        return list.isEmpty() ? EnumSet.noneOf(ShowItemStatus.class) : list;
    }

    @Test
    void returnByReviewerNeedsNoteButNotWhenManagerOrArranger() {
        ShowItem inReview = item(ShowItemStatus.IN_REVIEW);
        assertTrue(ShowItemTransitions.isReturnByReviewer(
                inReview, TeamRole.ARRANGER, REVIEWER, ShowItemStatus.ARRANGING));
        assertFalse(ShowItemTransitions.isReturnByReviewer(
                inReview, TeamRole.MANAGER, REVIEWER, ShowItemStatus.ARRANGING));
        assertFalse(ShowItemTransitions.isReturnByReviewer(
                inReview, TeamRole.ARRANGER, ARRANGER, ShowItemStatus.ARRANGING));
        assertFalse(ShowItemTransitions.isReturnByReviewer(
                inReview, TeamRole.ARRANGER, REVIEWER, ShowItemStatus.APPROVED));
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
                EnumSet.copyOf(ShowItemTransitions.allowed(self, TeamRole.ARRANGER, OTHER)));
    }
}
