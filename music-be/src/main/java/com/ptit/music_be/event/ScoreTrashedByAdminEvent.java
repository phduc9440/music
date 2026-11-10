package com.ptit.music_be.event;

/**
 * Phát (trong transaction xóa) khi ADMIN chuyển bản nhạc của người khác vào thùng rác. Nơi nghe dùng
 * {@code @TransactionalEventListener} để gửi thông báo {@code SCORE_TRASHED_BY_ADMIN} cho chủ sở hữu.
 *
 * @param scoreId id bản nhạc (đã vào thùng rác nên không tải lại bằng {@code findById} được)
 * @param ownerId id chủ sở hữu
 * @param scoreTitle tiêu đề bản nhạc, để ghi vào nội dung thông báo
 * @param reason lý do ADMIN nhập, có thể null
 */
public record ScoreTrashedByAdminEvent(String scoreId, String ownerId, String scoreTitle, String reason) {}
