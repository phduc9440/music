package com.ptit.music_be.service.notification.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.enums.NotificationType;
import com.ptit.music_be.dto.response.NotificationResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Notification;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.NotificationRepository;
import com.ptit.music_be.service.notification.NotificationService;

/** Thông báo lưu kèm params (JSON) để web dựng câu theo ngôn ngữ; bản ghi cũ không có params vẫn đọc được. */
class NotificationParamsTest {

    private final NotificationRepository repo = mock(NotificationRepository.class);
    private final NotificationServiceImpl service =
            new NotificationServiceImpl(repo, mock(MemberRepository.class), new ObjectMapper());
    private final Member owner = Member.builder().id("o").email("o@x.com").build();

    @Test
    void paramsAreStoredAsJsonAlongsideTheFallbackMessage() {
        service.notify(
                owner,
                null,
                NotificationType.NEW_REVIEW,
                "s1",
                "Lan đã nhận xét bản nhạc \"Bài 1\"",
                NotificationService.params("name", "Lan", "title", "Bài 1"));

        ArgumentCaptor<Notification> saved = ArgumentCaptor.forClass(Notification.class);
        verify(repo).save(saved.capture());
        assertEquals("Lan đã nhận xét bản nhạc \"Bài 1\"", saved.getValue().getMessage());
        assertEquals("{\"name\":\"Lan\",\"title\":\"Bài 1\"}", saved.getValue().getParams());
    }

    @Test
    void withoutParamsNothingIsStored() {
        service.notify(owner, null, NotificationType.ANNOUNCEMENT, null, "Chào mừng");

        ArgumentCaptor<Notification> saved = ArgumentCaptor.forClass(Notification.class);
        verify(repo).save(saved.capture());
        assertNull(saved.getValue().getParams());
    }

    @Test
    void paramsWithNullValuesAreDropped() {
        assertEquals(Map.of("title", "T"), NotificationService.params("title", "T", "reason", null));
    }

    @Test
    void responsesCarryParamsAndOldRowsHaveNone() {
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("o@x.com", "x", "ROLE_USER"));
        try {
            Notification withParams = Notification.builder()
                    .id("1")
                    .recipient(owner)
                    .type(NotificationType.SHARED_WITH_YOU)
                    .message("m")
                    .params("{\"title\":\"Bài 1\",\"level\":\"2\"}")
                    .build();
            Notification old = Notification.builder()
                    .id("2")
                    .recipient(owner)
                    .type(NotificationType.SHARED_WITH_YOU)
                    .message("m")
                    .build();
            Page<Notification> page = new PageImpl<>(List.of(withParams, old));
            when(repo.findByRecipientEmailOrderByCreatedAtDesc(any(), any(Pageable.class)))
                    .thenReturn(page);

            List<NotificationResponse> rows = service.getMine(0, 10).getContent();

            assertEquals(Map.of("title", "Bài 1", "level", "2"), rows.get(0).getParams());
            assertNull(rows.get(1).getParams());
        } finally {
            SecurityContextHolder.clearContext();
        }
    }
}
