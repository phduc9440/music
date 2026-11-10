package com.ptit.music_be.service.permission;

import com.ptit.music_be.entity.Score;

/**
 * Nơi duy nhất quyết định quyền của người đang đăng nhập trên một bản nhạc.
 *
 * <p>Thứ tự quyết định của {@link #resolve(Score)}:
 *
 * <ol>
 *   <li>Chủ sở hữu: OWNER.
 *   <li>Mức cao nhất trong: chia sẻ cá nhân, quyền qua team, REVIEW nếu bản đang PUBLIC.
 *   <li>Bản trong kho mẫu: ADMIN được EDIT.
 *   <li>ADMIN mà mức vẫn dưới VIEW: chỉ được VIEW (kiểm duyệt) khi bản PUBLIC hoặc PENDING; bản PRIVATE thì không.
 * </ol>
 *
 * SUPER_ADMIN không có quyền gì thêm so với ADMIN trên bản của người dùng thường.
 */
public interface ScorePermissionService {

    AccessDecision resolve(Score score);

    /** Sửa nội dung được nếu có từ EDIT trở lên; riêng bản trong kho mẫu thì chỉ ADMIN được sửa (kể cả chủ sở hữu). */
    boolean canEdit(Score score, AccessDecision decision);

    default boolean canEdit(Score score) {
        return canEdit(score, resolve(score));
    }

    /** Xóa được nếu là chủ sở hữu, hoặc ADMIN kiểm duyệt bản đang PUBLIC / PENDING. */
    default boolean canDelete(Score score) {
        return canDelete(score, resolve(score));
    }

    /** Như {@link #canDelete(Score)} nhưng dùng quyết định đã có sẵn, đỡ tính lại. */
    boolean canDelete(Score score, AccessDecision decision);

    /** Nếu người đang đăng nhập đang xem với tư cách kiểm duyệt thì báo cho {@link ScoreAccessAuditor}. */
    void auditModeratorAccess(Score score, String action);
}
