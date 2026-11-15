package com.ptit.music_be.service.team;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

import com.ptit.music_be.dto.enums.team.ShowItemStatus;
import com.ptit.music_be.dto.enums.team.TeamPermission;
import com.ptit.music_be.entity.ShowItem;

/**
 * Ai được chuyển một bài trong show sang trạng thái nào. "Người duyệt" của bài là người được giao duyệt; ai bấm Duyệt thì
 * trở thành người duyệt của bài (ShowServiceImpl ghi lại), nên bài đã duyệt luôn gắn với người đã duyệt nó.
 *
 * <ul>
 *   <li>Người duyệt của bài: IN_REVIEW → APPROVED (Duyệt), IN_REVIEW → ARRANGING (Trả lại, bắt buộc kèm góp ý), APPROVED →
 *       IN_REVIEW (Mở lại). Có quyền APPROVE_ANY (chủ nhóm luôn có) thì coi như người duyệt của mọi bài.
 *   <li>Có quyền MANAGE_SHOWS (người điều phối, mặc định quản lý): kéo tự do giữa TODO / ARRANGING / IN_REVIEW; sang
 *       APPROVED chỉ khi bài chưa có người duyệt hoặc mình là người duyệt. Bài đã duyệt thì chỉ người duyệt của bài mới
 *       chuyển đi được (người điều phối đồng thời là người duyệt thì sang trạng thái nào cũng được); người điều phối khác
 *       không mở lại được bài người khác đã duyệt.
 *   <li>Người phối của bài: TODO → ARRANGING, ARRANGING → TODO, ARRANGING → IN_REVIEW (Gửi duyệt), IN_REVIEW → ARRANGING
 *       (rút lại).
 * </ul>
 */
public final class ShowItemTransitions {

    private ShowItemTransitions() {}

    public static List<ShowItemStatus> allowed(ShowItem item, RolePermissions perms, String memberId) {
        ShowItemStatus from = item.getStatus();
        boolean coordinator = perms.has(TeamPermission.MANAGE_SHOWS);
        boolean reviewer = actsAsReviewer(item, perms, memberId);
        Set<ShowItemStatus> result = EnumSet.noneOf(ShowItemStatus.class);

        if (from == ShowItemStatus.APPROVED) {
            // Mở lại bài đã duyệt: chỉ việc của người duyệt
            if (reviewer) {
                result.add(ShowItemStatus.IN_REVIEW);
                if (coordinator) {
                    result.add(ShowItemStatus.TODO);
                    result.add(ShowItemStatus.ARRANGING);
                }
            }
            return new ArrayList<>(result);
        }

        if (coordinator) {
            result.add(ShowItemStatus.TODO);
            result.add(ShowItemStatus.ARRANGING);
            result.add(ShowItemStatus.IN_REVIEW);
            if (reviewer || item.getReviewer() == null) {
                result.add(ShowItemStatus.APPROVED);
            }
        }
        if (isArranger(item, memberId)) {
            switch (from) {
                case TODO -> result.add(ShowItemStatus.ARRANGING);
                case ARRANGING -> {
                    result.add(ShowItemStatus.TODO);
                    result.add(ShowItemStatus.IN_REVIEW);
                }
                case IN_REVIEW -> result.add(ShowItemStatus.ARRANGING);
                default -> {}
            }
        }
        if (reviewer && from == ShowItemStatus.IN_REVIEW) {
            result.add(ShowItemStatus.APPROVED);
            result.add(ShowItemStatus.ARRANGING);
        }
        result.remove(from);
        return new ArrayList<>(result);
    }

    /**
     * Đây là "Trả lại" (bắt buộc góp ý) khi người duyệt (không đồng thời là người phối, không phải người điều phối) đưa bài
     * từ chờ duyệt về đang phối.
     */
    public static boolean isReturnByReviewer(ShowItem item, RolePermissions perms, String memberId, ShowItemStatus to) {
        return item.getStatus() == ShowItemStatus.IN_REVIEW
                && to == ShowItemStatus.ARRANGING
                && actsAsReviewer(item, perms, memberId)
                && !isArranger(item, memberId)
                && !perms.has(TeamPermission.MANAGE_SHOWS);
    }

    /** Là người duyệt của bài, hoặc có quyền duyệt thay mọi bài (APPROVE_ANY, chủ nhóm luôn có). */
    public static boolean actsAsReviewer(ShowItem item, RolePermissions perms, String memberId) {
        return isReviewer(item, memberId) || perms.has(TeamPermission.APPROVE_ANY);
    }

    public static boolean isArranger(ShowItem item, String memberId) {
        return item.getArranger() != null && item.getArranger().getId().equals(memberId);
    }

    public static boolean isReviewer(ShowItem item, String memberId) {
        return item.getReviewer() != null && item.getReviewer().getId().equals(memberId);
    }
}
