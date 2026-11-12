package com.ptit.music_be.service.team;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

import com.ptit.music_be.dto.enums.team.ShowItemStatus;
import com.ptit.music_be.dto.enums.team.TeamRole;
import com.ptit.music_be.entity.ShowItem;

/**
 * Ai được chuyển một bài trong show sang trạng thái nào:
 *
 * <ul>
 *   <li>OWNER/MANAGER: sang mọi trạng thái (kéo thả tự do trên Kanban).
 *   <li>Người phối của bài: TODO → ARRANGING, ARRANGING → TODO, ARRANGING → IN_REVIEW (Gửi duyệt), IN_REVIEW →
 *       ARRANGING (rút lại).
 *   <li>Người duyệt của bài: IN_REVIEW → APPROVED (Duyệt), IN_REVIEW → ARRANGING (Trả lại, bắt buộc kèm góp ý), APPROVED →
 *       IN_REVIEW (mở lại).
 * </ul>
 */
public final class ShowItemTransitions {

    private ShowItemTransitions() {}

    public static List<ShowItemStatus> allowed(ShowItem item, TeamRole role, String memberId) {
        ShowItemStatus from = item.getStatus();
        Set<ShowItemStatus> result = EnumSet.noneOf(ShowItemStatus.class);
        if (role.canManage()) {
            result.addAll(EnumSet.allOf(ShowItemStatus.class));
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
        if (isReviewer(item, memberId)) {
            switch (from) {
                case IN_REVIEW -> {
                    result.add(ShowItemStatus.APPROVED);
                    result.add(ShowItemStatus.ARRANGING);
                }
                case APPROVED -> result.add(ShowItemStatus.IN_REVIEW);
                default -> {}
            }
        }
        result.remove(from);
        return new ArrayList<>(result);
    }

    /**
     * Đây là "Trả lại" (bắt buộc góp ý) khi người duyệt (không đồng thời là người phối, không phải quản lý) đưa bài từ
     * chờ duyệt về đang phối.
     */
    public static boolean isReturnByReviewer(ShowItem item, TeamRole role, String memberId, ShowItemStatus to) {
        return item.getStatus() == ShowItemStatus.IN_REVIEW
                && to == ShowItemStatus.ARRANGING
                && isReviewer(item, memberId)
                && !isArranger(item, memberId)
                && !role.canManage();
    }

    public static boolean isArranger(ShowItem item, String memberId) {
        return item.getArranger() != null && item.getArranger().getId().equals(memberId);
    }

    public static boolean isReviewer(ShowItem item, String memberId) {
        return item.getReviewer() != null && item.getReviewer().getId().equals(memberId);
    }
}
