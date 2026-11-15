package com.ptit.music_be.event;

/**
 * Phát (trong transaction của hành động gốc) khi một thành viên đạt điều kiện thưởng điểm. Nơi nghe dùng
 * {@code @TransactionalEventListener(AFTER_COMMIT)} nên hành động lỗi/hoàn tác thì không có điểm. Không có API nào cho
 * web tự cộng điểm: điểm chỉ đến từ sự kiện này.
 *
 * @param memberId người được thưởng
 * @param reason lý do (kèm số điểm và giới hạn)
 * @param refId mã tham chiếu của sự việc; cùng {@code (reason, refId)} chỉ được cộng một lần
 */
public record RewardEarnedEvent(String memberId, RewardReason reason, String refId) {}
