package com.ptit.music_be.service.notification;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.ptit.music_be.dto.response.notification.NotificationResponse;
import com.ptit.music_be.websocket.WebSocketConfig;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Đẩy thông báo mới tới chuông của người nhận qua STOMP (R8). Chỉ gửi sau khi giao dịch ghi thông báo đã commit, để
 * người nhận không nhận tin về một bản ghi rồi bị rollback; gửi lỗi thì chỉ ghi log vì chuông vẫn có poll dự phòng.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class NotificationPusher {

    private final SimpMessagingTemplate messagingTemplate;

    public void push(String recipientEmail, NotificationResponse payload) {
        if (recipientEmail == null) {
            return;
        }
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    send(recipientEmail, payload);
                }
            });
        } else {
            send(recipientEmail, payload);
        }
    }

    private void send(String recipientEmail, NotificationResponse payload) {
        try {
            messagingTemplate.convertAndSendToUser(recipientEmail, WebSocketConfig.NOTIFICATIONS_QUEUE, payload);
        } catch (RuntimeException e) {
            log.warn("Không đẩy được thông báo realtime tới {}", recipientEmail, e);
        }
    }
}
