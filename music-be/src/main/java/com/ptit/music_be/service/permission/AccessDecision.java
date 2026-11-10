package com.ptit.music_be.service.permission;

import com.ptit.music_be.dto.enums.ScoreAccess;

/**
 * Kết quả quyết định quyền của người đang đăng nhập với một bản nhạc.
 *
 * @param level mức truy cập
 * @param moderator đang xem với tư cách ADMIN kiểm duyệt (không phải chủ, không được chia sẻ), chỉ xảy ra với bản
 *     đang chờ duyệt
 * @param superAdmin người này là SUPER_ADMIN (chỉ để hiển thị; SUPER_ADMIN không có thêm quyền nào trên bản của người
 *     dùng thường)
 */
public record AccessDecision(ScoreAccess level, boolean moderator, boolean superAdmin) {

    /** Có ít nhất mức {@code required} không. */
    public boolean can(ScoreAccess required) {
        return level.includes(required);
    }
}
