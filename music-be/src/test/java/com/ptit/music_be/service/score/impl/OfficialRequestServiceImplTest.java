package com.ptit.music_be.service.score.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.configuration.ApplicationInitConfig;
import com.ptit.music_be.dto.enums.FileType;
import com.ptit.music_be.dto.enums.NotificationType;
import com.ptit.music_be.dto.enums.OfficialRequestStatus;
import com.ptit.music_be.dto.response.OfficialRequestResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.event.RewardEarnedEvent;
import com.ptit.music_be.event.RewardReason;
import com.ptit.music_be.entity.OfficialRequest;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.OfficialRequestRepository;
import com.ptit.music_be.repository.ScoreFileRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.notification.NotificationService;
import com.ptit.music_be.service.score.CopyOptions;
import com.ptit.music_be.service.score.ScoreCopyService;

class OfficialRequestServiceImplTest {

    private final OfficialRequestRepository requests = mock(OfficialRequestRepository.class);
    private final ScoreRepository scores = mock(ScoreRepository.class);
    private final ScoreFileRepository files = mock(ScoreFileRepository.class);
    private final MemberRepository members = mock(MemberRepository.class);
    private final ScoreCopyService copier = mock(ScoreCopyService.class);
    private final NotificationService notifications = mock(NotificationService.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final OfficialRequestServiceImpl service =
            new OfficialRequestServiceImpl(requests, scores, files, members, copier, notifications, events);

    private final Member admin = Member.builder()
            .id("admin")
            .email("boss@x.com")
            .fullName("Quản trị")
            .build();
    private final Member owner =
            Member.builder().id("owner").email("owner@x.com").fullName("Lan").build();
    private final Member system = Member.builder()
            .id("sys")
            .email(ApplicationInitConfig.ROOT_ADMIN_EMAIL)
            .build();
    private Score score;

    @BeforeEach
    void setUp() {
        score = Score.builder()
                .id("s1")
                .title("Bài 1")
                .member(owner)
                .visibility("PUBLIC")
                .isOfficial(false)
                .build();
        when(scores.findById("s1")).thenReturn(Optional.of(score));
        when(scores.save(any(Score.class))).thenAnswer(i -> i.getArgument(0));
        when(requests.save(any(OfficialRequest.class))).thenAnswer(i -> i.getArgument(0));
        when(members.findByEmail("boss@x.com")).thenReturn(Optional.of(admin));
        when(members.findByEmail("owner@x.com")).thenReturn(Optional.of(owner));
        when(members.findByEmail(ApplicationInitConfig.ROOT_ADMIN_EMAIL)).thenReturn(Optional.of(system));
        when(files.findByScoreIdAndFileTypeOrderByPageNumberAsc("s1", FileType.MUSICXML))
                .thenReturn(List.of(new ScoreFile()));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private void login(String email, String... roles) {
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(email, "x", roles));
    }

    private static void assertError(Runnable call, ErrorCode code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(AppException.class, e -> assertThat(e.getErrorCode())
                .isEqualTo(code));
    }

    private OfficialRequest pending() {
        return OfficialRequest.builder()
                .id("r1")
                .score(score)
                .requestedBy(admin)
                .owner(owner)
                .status(OfficialRequestStatus.PENDING)
                .build();
    }

    // ------------------------------------------------------------------ xin

    @Test
    void adminAsksTheOwnerAndTheOwnerIsNotified() {
        login("boss@x.com", "ROLE_ADMIN");

        OfficialRequestResponse r = service.request("s1");

        assertThat(r.getStatus()).isEqualTo(OfficialRequestStatus.PENDING);
        assertThat(r.getOwnerEmail()).isNull(); // trả cho cả hai phía nên không kèm email chủ
        verify(notifications)
                .notify(eq(owner), eq(admin), eq(NotificationType.OFFICIAL_REQUESTED), eq("s1"), any(), any());
        verify(scores, never()).save(any(Score.class)); // chưa đụng tới bản của chủ
    }

    @Test
    void onlyAdminsCanAsk() {
        login("owner@x.com", "ROLE_USER");

        assertError(() -> service.request("s1"), ErrorCode.UNAUTHORIZED);
    }

    @Test
    void privateOrAlreadyOfficialScoresCannotBeAsked() {
        login("boss@x.com", "ROLE_ADMIN");
        score.setVisibility("PRIVATE");
        assertError(() -> service.request("s1"), ErrorCode.SCORE_NOT_PUBLIC_FOR_OFFICIAL);

        score.setVisibility("PUBLIC");
        score.setIsOfficial(true);
        assertError(() -> service.request("s1"), ErrorCode.SCORE_ALREADY_OFFICIAL);
    }

    @Test
    void acceptedBeforeMeansAlreadyInTheLibraryAndPendingMeansDuplicate() {
        login("boss@x.com", "ROLE_ADMIN");
        when(requests.hasLiveAcceptedCopy("s1")).thenReturn(true);
        assertError(() -> service.request("s1"), ErrorCode.SCORE_ALREADY_OFFICIAL);

        when(requests.hasLiveAcceptedCopy("s1")).thenReturn(false);
        when(requests.existsByScoreIdAndStatusIn("s1", Set.of(OfficialRequestStatus.PENDING)))
                .thenReturn(true);
        assertError(() -> service.request("s1"), ErrorCode.OFFICIAL_REQUEST_DUPLICATED);
    }

    @Test
    void scoreWithoutMusicXmlCannotBeAsked() {
        login("boss@x.com", "ROLE_ADMIN");
        when(files.findByScoreIdAndFileTypeOrderByPageNumberAsc("s1", FileType.MUSICXML))
                .thenReturn(List.of());

        assertError(() -> service.request("s1"), ErrorCode.MUSICXML_NOT_READY);
        verify(requests, never()).save(any(OfficialRequest.class));
    }

    @Test
    void scoreOfTheSystemAccountJoinsRightAway() {
        login("boss@x.com", "ROLE_ADMIN");
        score.setMember(system);

        OfficialRequestResponse r = service.request("s1");

        assertThat(score.getIsOfficial()).isTrue();
        assertThat(r.getStatus()).isEqualTo(OfficialRequestStatus.ACCEPTED);
        verify(notifications, never()).notify(any(), any(), any(), any(), any());
    }

    // ------------------------------------------------------------------ trả lời

    @Test
    void acceptCopiesToTheSystemAccountAndCreditsTheOwner() {
        login("owner@x.com", "ROLE_USER");
        OfficialRequest request = pending();
        when(requests.findById("r1")).thenReturn(Optional.of(request));
        Score copy = Score.builder().id("c1").title("Bài 1").build();
        when(copier.copy(eq("s1"), eq(system), any(CopyOptions.class))).thenReturn(copy);

        OfficialRequestResponse r = service.accept("r1");

        assertThat(copy.getIsOfficial()).isTrue();
        assertThat(copy.getVisibility()).isEqualTo("PUBLIC");
        assertThat(copy.getOriginalScoreId()).isEqualTo("s1");
        assertThat(copy.getArrangerName()).isEqualTo("Lan");
        assertThat(r.getStatus()).isEqualTo(OfficialRequestStatus.ACCEPTED);
        assertThat(r.getCopyScoreId()).isEqualTo("c1");
        // bản gốc của chủ không bị gắn cờ hay đổi quyền
        assertThat(score.getIsOfficial()).isFalse();
        assertThat(score.getVisibility()).isEqualTo("PUBLIC");
        verify(notifications)
                .notify(eq(admin), eq(owner), eq(NotificationType.OFFICIAL_ACCEPTED), eq("c1"), any(), any());
        // chủ bản được thưởng điểm một lần cho lời xin này
        verify(events).publishEvent(new RewardEarnedEvent("owner", RewardReason.SCORE_OFFICIAL, request.getId()));
    }

    @Test
    void anotherUserCannotAnswerAndLearnsNothing() {
        login("someone@x.com", "ROLE_USER");
        when(members.findByEmail("someone@x.com"))
                .thenReturn(Optional.of(
                        Member.builder().id("other").email("someone@x.com").build()));
        when(requests.findById("r1")).thenReturn(Optional.of(pending()));

        assertError(() -> service.accept("r1"), ErrorCode.OFFICIAL_REQUEST_NOT_EXISTED);
        assertError(() -> service.decline("r1"), ErrorCode.OFFICIAL_REQUEST_NOT_EXISTED);
        verify(copier, never()).copy(any(), any(), any());
    }

    @Test
    void acceptIsRefusedOnceTheOwnerTookTheScoreDown() {
        login("owner@x.com", "ROLE_USER");
        when(requests.findById("r1")).thenReturn(Optional.of(pending()));
        score.setVisibility("PRIVATE");

        assertError(() -> service.accept("r1"), ErrorCode.SCORE_NOT_PUBLIC_FOR_OFFICIAL);
        verify(copier, never()).copy(any(), any(), any());
    }

    @Test
    void aRequestCanOnlyBeAnsweredOnce() {
        login("owner@x.com", "ROLE_USER");
        OfficialRequest done = pending();
        done.setStatus(OfficialRequestStatus.DECLINED);
        when(requests.findById("r1")).thenReturn(Optional.of(done));

        assertError(() -> service.accept("r1"), ErrorCode.OFFICIAL_REQUEST_NOT_PENDING);
        assertError(() -> service.decline("r1"), ErrorCode.OFFICIAL_REQUEST_NOT_PENDING);
    }

    @Test
    void declineCopiesNothingAndTellsTheAdmin() {
        login("owner@x.com", "ROLE_USER");
        OfficialRequest request = pending();
        when(requests.findById("r1")).thenReturn(Optional.of(request));

        OfficialRequestResponse r = service.decline("r1");

        assertThat(r.getStatus()).isEqualTo(OfficialRequestStatus.DECLINED);
        verify(copier, never()).copy(any(), any(), any());
        verify(notifications)
                .notify(eq(admin), eq(owner), eq(NotificationType.OFFICIAL_DECLINED), eq("s1"), any(), any());
    }

    @Test
    void adminCanWithdrawOnlyAPendingRequest() {
        login("boss@x.com", "ROLE_ADMIN");
        OfficialRequest request = pending();
        when(requests.findById("r1")).thenReturn(Optional.of(request));

        assertThat(service.cancel("r1").getStatus()).isEqualTo(OfficialRequestStatus.CANCELED);
        assertError(() -> service.cancel("r1"), ErrorCode.OFFICIAL_REQUEST_NOT_PENDING);
    }

    @Test
    void adminListRejectsAnUnknownStatus() {
        login("boss@x.com", "ROLE_ADMIN");

        assertError(() -> service.getForAdmin(0, 20, "MAYBE"), ErrorCode.INVALID_FILTER);
    }
}
