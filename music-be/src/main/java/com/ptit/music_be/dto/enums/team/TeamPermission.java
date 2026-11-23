package com.ptit.music_be.dto.enums.team;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

/**
 * Một quyền trong team mà chủ nhóm bật / tắt được cho từng vai trò (Quản lý, Người phối, Người xem) ở bảng "Mỗi vai trò làm
 * được gì". Chủ nhóm luôn có mọi quyền. Những việc không nằm ở đây là cố định: chỉ chủ nhóm xóa / khôi phục nhóm, cấp vai
 * trò chủ nhóm và chỉnh bảng quyền; mọi thành viên xem được bản nhạc, buổi diễn, hoạt động; người được giao phối một bài
 * thì sửa được bài đó; người duyệt của bài duyệt, trả lại, mở lại được bài đó.
 *
 * <p>Thứ tự khai báo là thứ tự hàng trên bảng ở web.
 */
public enum TeamPermission {
    /** Sửa tên, mô tả nhóm. */
    EDIT_TEAM,
    /** Mời, đổi vai trò, xóa quản lý (cần cả MANAGE_MEMBERS). */
    MANAGE_MANAGERS,
    /** Mời, đổi vai trò, xóa người phối và người xem; thu hồi lời mời tương ứng. */
    MANAGE_MEMBERS,
    /** Tạo, sửa, xóa, khôi phục buổi diễn; thêm bớt bài, phân công, sắp thứ tự, kéo bài giữa các cột (trừ duyệt / mở lại). */
    MANAGE_SHOWS,
    /** Duyệt, trả lại, mở lại mọi bài như người duyệt của bài, kể cả bài đã giao người khác duyệt. */
    APPROVE_ANY,
    /** Sửa mọi bản nhạc của nhóm (cần cả COMMENT). */
    EDIT_SCORES,
    /** Như chủ bản nhạc với bản của người khác: xóa, đổi công khai, chia sẻ ra ngoài nhóm (cần cả EDIT_SCORES). */
    MANAGE_SCORES,
    /** Gỡ bản nhạc của người khác khỏi nhóm (bản của mình thì ai cũng gỡ được). */
    REMOVE_SCORES,
    /** Chuyển bản nhạc của mình vào nhóm. */
    ADD_SCORES,
    /** Nhận xét, góp ý vào bản nhạc của nhóm. */
    COMMENT;

    /** Quyền phải có kèm khi bật quyền này (bật quyền này thì tự bật các quyền đó). */
    public List<TeamPermission> requires() {
        return switch (this) {
            case MANAGE_MANAGERS -> List.of(MANAGE_MEMBERS);
            case MANAGE_SCORES -> List.of(EDIT_SCORES);
            case EDIT_SCORES -> List.of(COMMENT);
            default -> List.of();
        };
    }

    /** Quyền mặc định của vai trò khi chủ nhóm chưa chỉnh gì. OWNER: mọi quyền. */
    public static Set<TeamPermission> defaultsOf(TeamRole role) {
        return switch (role) {
            case OWNER -> EnumSet.allOf(TeamPermission.class);
            case MANAGER -> EnumSet.of(MANAGE_MEMBERS, MANAGE_SHOWS, EDIT_SCORES, REMOVE_SCORES, ADD_SCORES, COMMENT);
            case ARRANGER -> EnumSet.of(ADD_SCORES, COMMENT);
            case VIEWER -> EnumSet.noneOf(TeamPermission.class);
        };
    }

    /** Thêm các quyền phải có kèm (đệ quy), để bảng quyền lưu xuống luôn nhất quán. */
    public static Set<TeamPermission> withRequired(Set<TeamPermission> permissions) {
        Set<TeamPermission> result = EnumSet.noneOf(TeamPermission.class);
        List<TeamPermission> queue = new ArrayList<>(permissions);
        while (!queue.isEmpty()) {
            TeamPermission p = queue.remove(queue.size() - 1);
            if (p != null && result.add(p)) {
                queue.addAll(p.requires());
            }
        }
        return result;
    }
}
