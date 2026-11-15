package com.ptit.music_be.service.score.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.dto.enums.score.ScoreAccess;
import com.ptit.music_be.dto.enums.score.Visibility;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.event.RewardEarnedEvent;
import com.ptit.music_be.event.RewardReason;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.service.notification.NotificationService;
import com.ptit.music_be.service.permission.AccessDecision;
import com.ptit.music_be.service.permission.ScorePermissionService;

/** Admin chỉ kiểm duyệt: duyệt bản đang chờ (PENDING → PUBLIC) hoặc gỡ bản đã công khai (PUBLIC → PRIVATE). */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ScoreServiceImplAdminVisibilityTest {

    @Mock
    ScoreRepository scoreRepository;

    @Mock
    NotificationService notificationService;

    @Mock
    ScorePermissionService permissionService;

    @Mock
    ApplicationEventPublisher eventPublisher;

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
                .isOfficial(true)
                .build();
        when(scoreRepository.findById("s1")).thenReturn(Optional.of(score));
        when(scoreRepository.save(any(Score.class))).thenAnswer(inv -> inv.getArgument(0));
        when(permissionService.resolve(any())).thenReturn(new AccessDecision(ScoreAccess.NONE, true, false));
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("admin@x.com", "x", "ROLE_ADMIN"));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private void expectRejected(String current, Visibility target, ErrorCode code) {
        score.setVisibility(current);
        assertThatThrownBy(() -> service.setVisibilityByAdmin("s1", target, null))
                .isInstanceOfSatisfying(
                        AppException.class, e -> assertThat(e.getErrorCode()).isEqualTo(code));
        verify(scoreRepository, never()).save(any(Score.class));
        verify(notificationService, never()).notify(any(), any(), any(), any(), any());
        assertThat(score.getVisibility()).isEqualTo(current);
    }

    @Test
    void adminCannotPublishPrivateScoreOfSomeoneElse() {
        expectRejected("PRIVATE", Visibility.PUBLIC, ErrorCode.SCORE_NOT_PENDING_PUBLIC);
    }

    @Test
    void adminCannotTakeDownPendingScoreThroughVisibility() {
        // Từ chối bản chờ duyệt đi qua rejectPublic, không đi qua đường này
        expectRejected("PENDING", Visibility.PRIVATE, ErrorCode.SCORE_NOT_PUBLIC);
    }

    @Test
    void pendingScoreCanBeApproved() {
        score.setVisibility("PENDING");
        try {
            service.setVisibilityByAdmin("s1", Visibility.PUBLIC, null);
        } catch (RuntimeException ignored) {
            // phần dựng response cần nhiều thành phần khác; ở đây chỉ kiểm tra trạng thái đã lưu
        }
        ArgumentCaptor<Score> saved = ArgumentCaptor.forClass(Score.class);
        verify(scoreRepository).save(saved.capture());
        assertThat(saved.getValue().getVisibility()).isEqualTo("PUBLIC");
        verify(notificationService).notify(any(), any(), any(), any(), any(), any());
        // duyệt công khai thì phát sự kiện thưởng điểm cho chủ bản
        verify(eventPublisher).publishEvent(new RewardEarnedEvent("owner", RewardReason.SCORE_PUBLISHED, "s1"));
    }

    @Test
    void takingDownDoesNotRewardTheOwner() {
        score.setVisibility("PUBLIC");
        try {
            service.setVisibilityByAdmin("s1", Visibility.PRIVATE, "vi phạm");
        } catch (RuntimeException ignored) {
            // như trên
        }
        verify(eventPublisher, org.mockito.Mockito.never()).publishEvent(any(RewardEarnedEvent.class));
    }

    @Test
    void publicScoreCanBeTakenDownAndLeavesCuratedLibrary() {
        score.setVisibility("PUBLIC");
        try {
            service.setVisibilityByAdmin("s1", Visibility.PRIVATE, "spam");
        } catch (RuntimeException ignored) {
            // như trên
        }
        ArgumentCaptor<Score> saved = ArgumentCaptor.forClass(Score.class);
        verify(scoreRepository).save(saved.capture());
        assertThat(saved.getValue().getVisibility()).isEqualTo("PRIVATE");
        assertThat(saved.getValue().getIsOfficial()).isFalse();
        assertThat(saved.getValue().getRejectReason()).isEqualTo("spam");
    }
}
