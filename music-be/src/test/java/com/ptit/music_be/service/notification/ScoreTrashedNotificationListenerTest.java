package com.ptit.music_be.service.notification;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.ptit.music_be.dto.enums.NotificationType;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.event.ScoreTrashedByAdminEvent;
import com.ptit.music_be.repository.MemberRepository;

class ScoreTrashedNotificationListenerTest {

    private final MemberRepository members = mock(MemberRepository.class);
    private final NotificationService notifications = mock(NotificationService.class);
    private final ScoreTrashedNotificationListener listener =
            new ScoreTrashedNotificationListener(members, notifications);
    private final Member owner = Member.builder().id("owner").build();

    @Test
    void ownerIsToldWhichScoreAndWhy() {
        when(members.findById("owner")).thenReturn(Optional.of(owner));

        listener.onTrashedByAdmin(new ScoreTrashedByAdminEvent("s1", "owner", "Bài 1", "spam"));

        verify(notifications)
                .notify(
                        owner,
                        null,
                        NotificationType.SCORE_TRASHED_BY_ADMIN,
                        "s1",
                        "Bản nhạc \"Bài 1\" đã bị quản trị viên chuyển vào thùng rác (khôi phục được trong 30 ngày): spam",
                        java.util.Map.of("title", "Bài 1", "reason", "spam")); // web dựng câu theo ngôn ngữ từ params
    }

    @Test
    void messageWithoutReasonHasNoTrailingColon() {
        String message =
                ScoreTrashedNotificationListener.message(new ScoreTrashedByAdminEvent("s1", "owner", "Bài 1", null));

        assertTrue(message.endsWith("(khôi phục được trong 30 ngày)"));
    }

    @Test
    void missingOwnerIsIgnored() {
        when(members.findById("gone")).thenReturn(Optional.empty());

        listener.onTrashedByAdmin(new ScoreTrashedByAdminEvent("s1", "gone", "Bài 1", null));

        verify(notifications, never()).notify(any(), any(), any(), any(), any(), any());
    }

    @Test
    void notificationFailureDoesNotPropagate() {
        when(members.findById("owner")).thenReturn(Optional.of(owner));
        doThrow(new IllegalStateException("db down"))
                .when(notifications)
                .notify(any(), any(), any(), any(), any(), any());

        assertDoesNotThrow(() -> listener.onTrashedByAdmin(new ScoreTrashedByAdminEvent("s1", "owner", "Bài 1", null)));
    }
}
