package com.ptit.music_be.service.permission;

import com.ptit.music_be.entity.Score;

/**
 * Chỗ cắm cho nhật ký kiểm duyệt: ghi lại việc ADMIN xem hoặc xóa bản nhạc của người khác. Bản mặc định chỉ ghi log;
 * khi có bản cài thật (ghi {@code audit_logs}) thì nó tự thay thế bản mặc định.
 */
public interface ScoreAccessAuditor {

    /**
     * @param action ví dụ {@code VIEW}, {@code DELETE}
     */
    void onModeratorAccess(Score score, String memberEmail, String action);
}
