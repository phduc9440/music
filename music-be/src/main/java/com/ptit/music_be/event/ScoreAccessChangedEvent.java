package com.ptit.music_be.event;

/**
 * Chủ bản nhạc vừa đổi hoặc thu hồi quyền chia sẻ của một thành viên (C-05). Phiên cùng sửa đang mở của người đó cần
 * được báo ngay để chuyển sang chỉ xem, thay vì chỉ bị ngắt khi họ gửi thao tác tiếp theo.
 */
public record ScoreAccessChangedEvent(String scoreId, String memberId) {}
