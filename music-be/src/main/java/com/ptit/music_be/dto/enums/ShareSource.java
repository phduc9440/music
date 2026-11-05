package com.ptit.music_be.dto.enums;

/** Quyền trong member_scores có được từ đâu. */
public enum ShareSource {
    /** Chủ sở hữu mời trực tiếp hoặc duyệt yêu cầu xin quyền. */
    DIRECT,
    /** Người dùng vào bằng liên kết chia sẻ; bị thu hồi khi chủ tắt hoặc tạo lại liên kết. */
    LINK
}
