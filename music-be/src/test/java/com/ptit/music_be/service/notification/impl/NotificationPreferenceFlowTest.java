package com.ptit.music_be.service.notification.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Arrays;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.enums.notification.NotificationCategory;
import com.ptit.music_be.dto.enums.notification.NotificationType;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.notification.NotificationRepository;
import com.ptit.music_be.service.notification.NotificationPreferenceService;
import com.ptit.music_be.service.notification.NotificationPreferenceService.Delivery;
import com.ptit.music_be.service.notification.NotificationPusher;

/** Cài đặt thông báo (mục R8): tắt cả hai thì không tạo, chỉ email thì lưu nhưng không đẩy chuông. */
class NotificationPreferenceFlowTest {

    private final NotificationRepository repo = mock(NotificationRepository.class);
    private final NotificationPusher pusher = mock(NotificationPusher.class);
    private final NotificationPreferenceService prefs = mock(NotificationPreferenceService.class);
    private final NotificationServiceImpl service =
            new NotificationServiceImpl(repo, mock(MemberRepository.class), new ObjectMapper(), pusher, prefs);
    private final Member owner = Member.builder().id("o").email("o@x.com").build();

    @Test
    void everyTypeBelongsToExactlyOneCategory() {
        for (NotificationType type : NotificationType.values()) {
            long hits = Arrays.stream(NotificationCategory.values())
                    .filter(c -> c.types().contains(type))
                    .count();
            assertEquals(1, hits, type.name());
        }
        assertEquals(NotificationCategory.SYSTEM, NotificationCategory.of(NotificationType.ANNOUNCEMENT));
        assertTrue(!NotificationCategory.configurable().contains(NotificationCategory.SYSTEM));
    }

    @Test
    void bothOffCreatesNothing() {
        when(prefs.deliveryFor("o", NotificationType.FORUM_REPLY)).thenReturn(new Delivery(false, false));

        service.notify(owner, null, NotificationType.FORUM_REPLY, null, "x");

        verify(repo, never()).save(any());
        verify(pusher, never()).push(any(), any());
    }

    @Test
    void emailOnlyStoresButDoesNotPushToTheBell() {
        when(prefs.deliveryFor("o", NotificationType.FORUM_REPLY)).thenReturn(new Delivery(false, true));

        service.notify(owner, null, NotificationType.FORUM_REPLY, null, "x");

        verify(repo).save(any());
        verify(pusher, never()).push(any(), any());
    }

    @Test
    void inAppPushesToTheBell() {
        when(prefs.deliveryFor("o", NotificationType.FORUM_REPLY)).thenReturn(Delivery.DEFAULT);

        service.notify(owner, null, NotificationType.FORUM_REPLY, null, "x");

        verify(repo).save(any());
        verify(pusher).push(any(), any());
    }
}
