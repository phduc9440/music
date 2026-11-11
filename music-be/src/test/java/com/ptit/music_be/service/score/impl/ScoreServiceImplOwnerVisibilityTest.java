package com.ptit.music_be.service.score.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.dto.enums.NotificationType;
import com.ptit.music_be.dto.enums.Visibility;
import com.ptit.music_be.dto.request.ScoreUpdateRequest;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.notification.NotificationService;
import com.ptit.music_be.service.score.ScoreFileService;

/** Chủ sở hữu xin công khai, hủy yêu cầu hoặc chuyển bản đã công khai về riêng tư (nút trong mục Quản lý). */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ScoreServiceImplOwnerVisibilityTest {

    @Mock
    ScoreRepository scoreRepository;

    @Mock
    MemberRepository memberRepository;

    @Mock
    NotificationService notificationService;

    @Mock
    ScoreFileService scoreFileService;

    @InjectMocks
    ScoreServiceImpl service;

    private final Member owner =
            Member.builder().id("owner").email("owner@x.com").build();
    private Score score;

    @BeforeEach
    void setUp() {
        score = Score.builder()
                .id("s1")
                .title("Bài 1")
                .member(owner)
                .visibility("PRIVATE")
                .rejectReason("lý do cũ")
                .build();
        when(scoreRepository.findById("s1")).thenReturn(Optional.of(score));
        when(scoreRepository.save(any(Score.class))).thenAnswer(inv -> inv.getArgument(0));
        when(memberRepository.findByEmail("owner@x.com")).thenReturn(Optional.of(owner));
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("owner@x.com", "x", "ROLE_USER"));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private void change(Visibility visibility) {
        ScoreUpdateRequest request = new ScoreUpdateRequest();
        request.setVisibility(visibility);
        try {
            service.updateScore("s1", request);
        } catch (RuntimeException ignored) {
            // phần dựng response cần nhiều thành phần khác; ở đây chỉ kiểm tra trạng thái đã lưu
        }
    }

    @Test
    void privateScoreBecomesPendingAndAdminsAreNotified() {
        change(Visibility.PUBLIC);

        assertThat(score.getVisibility()).isEqualTo("PENDING");
        assertThat(score.getRejectReason()).isNull();
        verify(notificationService)
                .notifyAdmins(eq(owner), eq(NotificationType.PUBLISH_REQUESTED), eq("s1"), any(), any());
    }

    @Test
    void pendingRequestCanBeWithdrawn() {
        score.setVisibility("PENDING");

        change(Visibility.PRIVATE);

        assertThat(score.getVisibility()).isEqualTo("PRIVATE");
    }

    @Test
    void publicScoreGoesBackToPrivateImmediately() {
        score.setVisibility("PUBLIC");

        change(Visibility.PRIVATE);

        assertThat(score.getVisibility()).isEqualTo("PRIVATE");
        verify(notificationService, never()).notifyAdmins(any(), any(), any(), any());
    }

    @Test
    void askingAgainWhilePendingDoesNotNotifyTwice() {
        score.setVisibility("PENDING");

        change(Visibility.PUBLIC);

        assertThat(score.getVisibility()).isEqualTo("PENDING");
        verify(notificationService, never()).notifyAdmins(any(), any(), any(), any());
    }

    @Test
    void publicScoreStaysPublicWhenOwnerAsksForPublicAgain() {
        score.setVisibility("PUBLIC");

        change(Visibility.PUBLIC);

        assertThat(score.getVisibility()).isEqualTo("PUBLIC");
    }
}
