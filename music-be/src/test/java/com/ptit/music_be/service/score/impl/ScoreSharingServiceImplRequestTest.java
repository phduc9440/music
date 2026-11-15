package com.ptit.music_be.service.score.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
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
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.dto.enums.notification.NotificationType;
import com.ptit.music_be.dto.enums.score.SharePermission;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.MemberScore;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.score.MemberScoreRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.service.notification.NotificationService;
import com.ptit.music_be.service.score.ScoreFileService;

/** Xin quyền: xem, nhận xét hoặc chỉnh sửa (người chỉ có quyền xem xin thêm quyền nhận xét để góp ý). */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ScoreSharingServiceImplRequestTest {

    @Mock
    ScoreRepository scoreRepository;

    @Mock
    MemberRepository memberRepository;

    @Mock
    MemberScoreRepository memberScoreRepository;

    @Mock
    ScoreFileService scoreFileService;

    @Mock
    NotificationService notificationService;

    @InjectMocks
    ScoreSharingServiceImpl service;

    private final Member owner = Member.builder().id("owner").email("owner@x.com").build();
    private final Member me = Member.builder().id("me").email("me@x.com").build();

    @BeforeEach
    void setUp() {
        Score score = Score.builder().id("s1").title("Bài 1").member(owner).build();
        when(scoreRepository.findById("s1")).thenReturn(Optional.of(score));
        when(memberRepository.findByEmail("me@x.com")).thenReturn(Optional.of(me));
        when(memberScoreRepository.findByScoreIdAndMemberId("s1", "me")).thenReturn(Optional.empty());
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken("me@x.com", "x", "ROLE_USER"));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void viewerCanAskForReviewAccessAndOwnerIsNotified() {
        when(scoreFileService.getAccessLevel(any())).thenReturn("VIEW");

        var result = service.requestAccess("s1", SharePermission.REVIEW, "cho mình góp ý với");

        ArgumentCaptor<MemberScore> saved = ArgumentCaptor.forClass(MemberScore.class);
        verify(memberScoreRepository).save(saved.capture());
        assertThat(saved.getValue().getRequestedPermission()).isEqualTo(SharePermission.REVIEW);
        assertThat(saved.getValue().getRequestMessage()).isEqualTo("cho mình góp ý với");
        assertThat(result.getRequestedPermission()).isEqualTo(SharePermission.REVIEW);
        verify(notificationService)
                .notify(any(), any(), org.mockito.ArgumentMatchers.eq(NotificationType.ACCESS_REQUESTED), any(), any(), any());
    }

    @Test
    void askingForReviewWhenAlreadyHavingItIsRejected() {
        when(scoreFileService.getAccessLevel(any())).thenReturn("REVIEW");

        assertThatThrownBy(() -> service.requestAccess("s1", SharePermission.REVIEW, null))
                .isInstanceOfSatisfying(
                        AppException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.ALREADY_HAS_ACCESS));
    }

    @Test
    void editorAlreadyIncludesReview() {
        when(scoreFileService.getAccessLevel(any())).thenReturn("EDIT");

        assertThatThrownBy(() -> service.requestAccess("s1", SharePermission.REVIEW, null))
                .isInstanceOfSatisfying(
                        AppException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.ALREADY_HAS_ACCESS));
    }
}
