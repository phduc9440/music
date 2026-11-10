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

import com.ptit.music_be.dto.enums.ScoreAccess;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.event.ScoreTrashedByAdminEvent;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.AiTaskRepository;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.permission.AccessDecision;
import com.ptit.music_be.service.permission.ScorePermissionService;

/** Xóa bản nhạc là xóa mềm: đặt cờ vào thùng rác, giữ file và các dòng liên quan. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ScoreServiceImplDeleteTest {

    @Mock
    ScoreRepository scoreRepository;

    @Mock
    MemberRepository memberRepository;

    @Mock
    AiTaskRepository aiTaskRepository;

    @Mock
    ScorePermissionService permissionService;

    @Mock
    ApplicationEventPublisher eventPublisher;

    @InjectMocks
    ScoreServiceImpl service;

    private final Member owner =
            Member.builder().id("owner").email("owner@x.com").build();
    private final Member admin =
            Member.builder().id("admin").email("admin@x.com").build();
    private Score score;

    @BeforeEach
    void setUp() {
        score = Score.builder()
                .id("s1")
                .title("Bài 1")
                .member(owner)
                .visibility("PRIVATE")
                .isOfficial(false)
                .build();
        when(scoreRepository.findById("s1")).thenReturn(Optional.of(score));
        when(memberRepository.findByEmail("owner@x.com")).thenReturn(Optional.of(owner));
        when(memberRepository.findByEmail("admin@x.com")).thenReturn(Optional.of(admin));
        when(aiTaskRepository.existsByScoreIdAndStatusIn(any(), any())).thenReturn(false);
        when(scoreRepository.save(any(Score.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private void loginAs(String email, ScoreAccess level, boolean canDelete, String... authorities) {
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(email, "x", authorities));
        AccessDecision decision = new AccessDecision(level, false, false);
        when(permissionService.resolve(score)).thenReturn(decision);
        when(permissionService.canDelete(score, decision)).thenReturn(canDelete);
    }

    @Test
    void ownerMovesScoreToTrashAndPendingRequestIsCancelled() {
        loginAs("owner@x.com", ScoreAccess.OWNER, true, "ROLE_USER");
        score.setVisibility("PENDING");

        service.deleteScore("s1");

        assertThat(score.getDeletedAt()).isNotNull();
        assertThat(score.getDeletedBy()).isEqualTo("owner");
        assertThat(score.getVisibility()).isEqualTo("PRIVATE");
        verify(scoreRepository, never()).delete(any(Score.class));
        verify(eventPublisher, never()).publishEvent(any(Object.class));
    }

    @Test
    void ownerKeepsPublicVisibilityWhenTrashing() {
        loginAs("owner@x.com", ScoreAccess.OWNER, true, "ROLE_USER");
        score.setVisibility("PUBLIC");

        service.deleteScore("s1");

        assertThat(score.getVisibility()).isEqualTo("PUBLIC");
    }

    @Test
    void adminTrashingSomeoneElsesScoreUnpublishesItAndNotifiesOwner() {
        loginAs("admin@x.com", ScoreAccess.REVIEW, true, "ROLE_ADMIN");
        score.setVisibility("PUBLIC");
        score.setIsOfficial(true);

        service.deleteScore("s1", "  Vi phạm bản quyền  ");

        assertThat(score.getDeletedBy()).isEqualTo("admin");
        assertThat(score.getDeleteReason()).isEqualTo("Vi phạm bản quyền");
        assertThat(score.getVisibility()).isEqualTo("PRIVATE");
        assertThat(score.getIsOfficial()).isFalse();
        verify(permissionService).auditModeratorAccess(score, "DELETE");
        ArgumentCaptor<Object> event = ArgumentCaptor.forClass(Object.class);
        verify(eventPublisher).publishEvent(event.capture());
        assertThat(event.getValue())
                .isEqualTo(new ScoreTrashedByAdminEvent("s1", "owner", "Bài 1", "Vi phạm bản quyền"));
    }

    @Test
    void personWithoutDeletePermissionIsRejected() {
        loginAs("owner@x.com", ScoreAccess.EDIT, false, "ROLE_USER");

        assertThatThrownBy(() -> service.deleteScore("s1"))
                .isInstanceOfSatisfying(
                        AppException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.UNAUTHORIZED));
        assertThat(score.getDeletedAt()).isNull();
    }

    @Test
    void scoreWithRunningTaskIsBusy() {
        loginAs("owner@x.com", ScoreAccess.OWNER, true, "ROLE_USER");
        when(aiTaskRepository.existsByScoreIdAndStatusIn(any(), any())).thenReturn(true);

        assertThatThrownBy(() -> service.deleteScore("s1"))
                .isInstanceOfSatisfying(
                        AppException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.SCORE_BUSY));
        assertThat(score.getDeletedAt()).isNull();
    }

    @Test
    void ownerCannotTrashOfficialScore() {
        loginAs("owner@x.com", ScoreAccess.OWNER, true, "ROLE_USER");
        score.setIsOfficial(true);

        assertThatThrownBy(() -> service.deleteScore("s1"))
                .isInstanceOfSatisfying(AppException.class, e -> assertThat(e.getErrorCode())
                        .isEqualTo(ErrorCode.SCORE_OFFICIAL_LOCKED));
    }
}
