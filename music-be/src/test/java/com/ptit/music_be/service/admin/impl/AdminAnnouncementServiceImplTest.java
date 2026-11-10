package com.ptit.music_be.service.admin.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.dto.enums.AnnouncementAudience;
import com.ptit.music_be.dto.enums.MemberStatus;
import com.ptit.music_be.dto.enums.NotificationType;
import com.ptit.music_be.dto.request.AnnouncementRequest;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.service.NotificationService;

class AdminAnnouncementServiceImplTest {

    private final MemberRepository members = mock(MemberRepository.class);
    private final NotificationService notifications = mock(NotificationService.class);
    private final AdminAnnouncementServiceImpl service = new AdminAnnouncementServiceImpl(members, notifications);

    private final Member me = Member.builder()
            .id("me")
            .email("admin@x.com")
            .status(MemberStatus.ACTIVE)
            .build();
    private final Member u1 = Member.builder()
            .id("u1")
            .email("u1@x.com")
            .status(MemberStatus.ACTIVE)
            .build();
    private final Member lockedAdmin = Member.builder()
            .id("a2")
            .email("a2@x.com")
            .status(MemberStatus.INACTIVE)
            .build();

    @BeforeEach
    void setUp() {
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("admin@x.com", "x", "ROLE_ADMIN"));
        when(members.findByEmail("admin@x.com")).thenReturn(Optional.of(me));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private AnnouncementRequest req(String msg, AnnouncementAudience audience) {
        return new AnnouncementRequest(msg, audience, null);
    }

    @Test
    void allGoesToActiveMembersAndPassesSenderSoItIsSkipped() {
        when(members.findAllByStatus(MemberStatus.ACTIVE)).thenReturn(List.of(me, u1));
        when(notifications.notifyAll(anyCollection(), eq(me), eq(NotificationType.ANNOUNCEMENT), eq("Bảo trì 22h")))
                .thenReturn(1);

        assertEquals(
                1,
                service.send(req("  Bảo trì 22h  ", AnnouncementAudience.ALL)).getRecipients());
    }

    @Test
    void usersUsesNonAdminQuery() {
        when(members.findNonAdminsByStatus(MemberStatus.ACTIVE)).thenReturn(List.of(u1));
        service.send(req("Hi", AnnouncementAudience.USERS));

        verify(notifications).notifyAll(eq(List.of(u1)), eq(me), eq(NotificationType.ANNOUNCEMENT), eq("Hi"));
        verify(members, never()).findAllByStatus(any());
    }

    @Test
    void adminsExcludesLockedAccounts() {
        when(members.findAllAdmins()).thenReturn(List.of(me, lockedAdmin));
        service.send(req("Hi", AnnouncementAudience.ADMINS));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<java.util.Collection<Member>> captor = ArgumentCaptor.forClass(java.util.Collection.class);
        verify(notifications).notifyAll(captor.capture(), eq(me), eq(NotificationType.ANNOUNCEMENT), eq("Hi"));
        assertEquals(List.of(me), List.copyOf(captor.getValue()));
    }

    @Test
    void selectedSendsOnlyToChosenActiveMembers() {
        when(members.findAllById(List.of("u1", "a2"))).thenReturn(List.of(u1, lockedAdmin));
        service.send(new AnnouncementRequest("Hi", AnnouncementAudience.SELECTED, List.of("u1", "a2", "u1", " ")));

        verify(notifications).notifyAll(eq(List.of(u1)), eq(me), eq(NotificationType.ANNOUNCEMENT), eq("Hi"));
    }

    @Test
    void selectedWithoutMembersIsRejected() {
        assertThrows(
                AppException.class,
                () -> service.send(new AnnouncementRequest("Hi", AnnouncementAudience.SELECTED, List.of())));
        assertThrows(
                AppException.class,
                () -> service.send(new AnnouncementRequest("Hi", AnnouncementAudience.SELECTED, null)));
    }

    @Test
    void blankMessageOrMissingAudienceIsRejected() {
        assertThrows(AppException.class, () -> service.send(req("   ", AnnouncementAudience.ALL)));
        assertThrows(AppException.class, () -> service.send(req("Hi", null)));
        verify(notifications, never()).notifyAll(any(), any(), any(), any());
    }
}
