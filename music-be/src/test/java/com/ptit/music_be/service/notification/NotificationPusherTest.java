package com.ptit.music_be.service.notification;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.ptit.music_be.dto.response.NotificationResponse;

/** Thông báo realtime chỉ được gửi sau khi giao dịch ghi thông báo đã commit. */
class NotificationPusherTest {

    private final SimpMessagingTemplate template = mock(SimpMessagingTemplate.class);
    private final NotificationPusher pusher = new NotificationPusher(template);
    private final NotificationResponse payload =
            NotificationResponse.builder().id("n1").message("hi").build();

    @AfterEach
    void cleanUp() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void sendsImmediatelyWhenThereIsNoTransaction() {
        pusher.push("a@x.com", payload);

        verify(template).convertAndSendToUser("a@x.com", "/queue/notifications", payload);
    }

    @Test
    void waitsForCommitInsideATransaction() {
        TransactionSynchronizationManager.initSynchronization();

        pusher.push("a@x.com", payload);
        verify(template, never()).convertAndSendToUser(any(), any(), any(Object.class));

        TransactionSynchronizationManager.getSynchronizations().forEach(TransactionSynchronization::afterCommit);
        verify(template).convertAndSendToUser(eq("a@x.com"), eq("/queue/notifications"), eq(payload));
    }

    @Test
    void rolledBackTransactionSendsNothing() {
        TransactionSynchronizationManager.initSynchronization();

        pusher.push("a@x.com", payload);
        TransactionSynchronizationManager.getSynchronizations()
                .forEach(s -> s.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));

        verify(template, never()).convertAndSendToUser(any(), any(), any(Object.class));
    }

    @Test
    void sendFailureDoesNotBreakTheCaller() {
        org.mockito.Mockito.doThrow(new IllegalStateException("broker down"))
                .when(template)
                .convertAndSendToUser(any(), any(), any(Object.class));

        pusher.push("a@x.com", payload); // không ném ra ngoài
    }
}
