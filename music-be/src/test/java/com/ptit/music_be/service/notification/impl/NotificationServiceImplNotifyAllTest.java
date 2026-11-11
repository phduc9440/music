package com.ptit.music_be.service.notification.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.ptit.music_be.dto.enums.NotificationType;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Notification;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.NotificationRepository;

class NotificationServiceImplNotifyAllTest {

    private final NotificationRepository repo = mock(NotificationRepository.class);
    private final NotificationServiceImpl service = new NotificationServiceImpl(
            repo, mock(MemberRepository.class), new com.fasterxml.jackson.databind.ObjectMapper());

    @Test
    @SuppressWarnings("unchecked")
    void skipsSenderAndTruncatesMessage() {
        Member me = Member.builder().id("me").build();
        Member a = Member.builder().id("a").build();
        Member b = Member.builder().id("b").build();

        int sent = service.notifyAll(List.of(me, a, b), me, NotificationType.ANNOUNCEMENT, "x".repeat(600));

        assertEquals(2, sent);
        ArgumentCaptor<List<Notification>> captor = ArgumentCaptor.forClass(List.class);
        verify(repo).saveAll(captor.capture());
        assertEquals(2, captor.getValue().size());
        assertEquals(500, captor.getValue().get(0).getMessage().length());
        assertEquals(NotificationType.ANNOUNCEMENT, captor.getValue().get(0).getType());
    }
}
