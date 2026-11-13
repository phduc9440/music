package com.ptit.music_be.websocket;

import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.stomp.StompCommand;

/**
 * Luật cho một nhóm đích STOMP ngoài kênh thông báo. {@link WebSocketConfig} mặc định chặn mọi SUBSCRIBE và mọi tin
 * client gửi lên; một tính năng muốn mở kênh của mình thì khai báo một bean {@code StompAccessRule} nhận các đích đó và
 * tự kiểm quyền. Đích không luật nào nhận thì vẫn bị chặn.
 */
public interface StompAccessRule {

    /** Luật này có phụ trách đích {@code destination} (ví dụ {@code /topic/scores/abc/ops}) không. */
    boolean handles(String destination);

    /**
     * Cho phép hay không.
     *
     * @param command {@code SUBSCRIBE} hoặc {@code SEND}
     * @param email principal của phiên (email đã xác thực lúc bắt tay)
     * @throws MessagingException nếu không được phép; kết nối bị ngắt với lỗi này
     */
    void authorize(StompCommand command, String destination, String email);
}
