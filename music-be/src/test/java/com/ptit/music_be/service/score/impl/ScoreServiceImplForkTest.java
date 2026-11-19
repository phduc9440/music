package com.ptit.music_be.service.score.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
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

import com.ptit.music_be.dto.enums.score.ScoreAccess;
import com.ptit.music_be.dto.enums.score.ScoreLicense;
import com.ptit.music_be.dto.request.score.ScoreUpdateRequest;
import com.ptit.music_be.dto.response.score.ScoreDetailResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.code.ScoreErrorCode;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.repository.score.ScoreReviewRepository;
import com.ptit.music_be.service.permission.AccessDecision;
import com.ptit.music_be.service.permission.ScorePermissionService;
import com.ptit.music_be.service.score.CopyOptions;
import com.ptit.music_be.service.score.ScoreCopyService;
import com.ptit.music_be.service.score.ScoreFileService;

/** Giấy phép và tạo bản phối (mục R4). */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ScoreServiceImplForkTest {

    @Mock
    ScoreRepository scoreRepository;

    @Mock
    MemberRepository memberRepository;

    @Mock
    ScoreCopyService scoreCopyService;

    @Mock
    ScoreFileService scoreFileService;

    @Mock
    ScorePermissionService permissionService;

    @Mock
    ScoreReviewRepository scoreReviewRepository;

    @Mock
    com.ptit.music_be.repository.score.ScoreFileRepository scoreFileRepository;

    @Mock
    com.ptit.music_be.repository.ai.AiTaskRepository aiTaskRepository;

    @Mock
    com.ptit.music_be.repository.team.TeamRepository teamRepository;

    @Mock
    com.ptit.music_be.mapper.ScoreFileMapper scoreFileMapper;

    @Mock
    com.ptit.music_be.mapper.AiTaskMapper aiTaskMapper;

    @InjectMocks
    ScoreServiceImpl service;

    private final Member owner =
            Member.builder().id("owner").email("owner@x.com").fullName("Chủ").build();
    private final Member me = Member.builder().id("me").email("me@x.com").build();
    private Score source;

    @BeforeEach
    void setUp() {
        source = Score.builder()
                .id("src")
                .title("Bài gốc")
                .member(owner)
                .visibility("PUBLIC")
                .license(ScoreLicense.CC_BY)
                .allowArrange(true)
                .build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("me@x.com", "x", "ROLE_USER"));
        when(memberRepository.findByEmail("me@x.com")).thenReturn(Optional.of(me));
        when(scoreRepository.findById("src")).thenReturn(Optional.of(source));
        when(scoreRepository.save(any(Score.class))).thenAnswer(inv -> inv.getArgument(0));
        when(scoreReviewRepository.getRatingStats(any())).thenReturn(mock(ScoreReviewRepository.RatingStats.class));
        when(permissionService.resolve(any(Score.class)))
                .thenReturn(new AccessDecision(ScoreAccess.OWNER, false, false));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private Score copyOf(Score from) {
        return Score.builder()
                .id("copy")
                .title(from.getTitle())
                .member(me)
                .visibility("PRIVATE")
                .build();
    }

    @Test
    void forkCreatesPrivateCopyThatRemembersTheSourceAndInheritsItsLicense() {
        Score copy = copyOf(source);
        when(scoreCopyService.copy(any(), any(), any(CopyOptions.class))).thenReturn(copy);

        ScoreDetailResponse detail = service.forkScore("src");

        assertThat(copy.getForkedFrom()).isSameAs(source);
        assertThat(copy.getLicense()).isEqualTo(ScoreLicense.CC_BY);
        assertThat(copy.isAllowArrange()).isFalse();
        assertThat(copy.getVisibility()).isEqualTo("PRIVATE");
        assertThat(detail.getForkedFrom().getTitle()).isEqualTo("Bài gốc");
        assertThat(detail.getForkedFrom().getOwnerName()).isEqualTo("Chủ");
    }

    @Test
    void scoreThatIsNotPublicLooksNonExistent() {
        source.setVisibility("PRIVATE");

        assertThatThrownBy(() -> service.forkScore("src"))
                .isInstanceOf(AppException.class)
                .extracting(e -> ((AppException) e).getErrorCode())
                .isEqualTo(ScoreErrorCode.SCORE_NOT_EXISTED);
    }

    @Test
    void ownerMustAllowArranging() {
        source.setAllowArrange(false);

        assertThatThrownBy(() -> service.forkScore("src"))
                .extracting(e -> ((AppException) e).getErrorCode())
                .isEqualTo(ScoreErrorCode.SCORE_FORK_NOT_ALLOWED);
        verify(scoreCopyService, never()).copy(any(), any(), any());
    }

    @Test
    void allRightsReservedNeverAllowsForking() {
        source.setLicense(ScoreLicense.ALL_RIGHTS_RESERVED);

        assertThatThrownBy(() -> service.forkScore("src"))
                .extracting(e -> ((AppException) e).getErrorCode())
                .isEqualTo(ScoreErrorCode.SCORE_FORK_NOT_ALLOWED);
    }

    @Test
    void twentyForksInADayIsTheLimit() {
        when(scoreRepository.countForksSince(any(), any(LocalDateTime.class))).thenReturn(20L);

        assertThatThrownBy(() -> service.forkScore("src"))
                .extracting(e -> ((AppException) e).getErrorCode())
                .isEqualTo(ScoreErrorCode.SCORE_FORK_RATE_LIMITED);
        verify(scoreCopyService, never()).copy(any(), any(), any());
    }

    @Test
    void turningOnArrangingNeedsALicenseThatAllowsIt() {
        Score mine =
                Score.builder().id("mine").member(owner).visibility("PUBLIC").build();
        when(scoreRepository.findById("mine")).thenReturn(Optional.of(mine));
        ScoreUpdateRequest request = new ScoreUpdateRequest();
        request.setAllowArrange(true);

        assertThatThrownBy(() -> service.updateScore("mine", request))
                .extracting(e -> ((AppException) e).getErrorCode())
                .isEqualTo(ScoreErrorCode.SCORE_LICENSE_REQUIRED);

        request.setLicense(ScoreLicense.CC_BY);
        service.updateScore("mine", request);
        assertThat(mine.isAllowArrange()).isTrue();
        assertThat(mine.getLicense()).isEqualTo(ScoreLicense.CC_BY);
    }

    @Test
    void goingBackToAllRightsReservedTurnsArrangingOff() {
        ScoreUpdateRequest request = new ScoreUpdateRequest();
        request.setLicense(ScoreLicense.ALL_RIGHTS_RESERVED);

        service.updateScore("src", request);

        assertThat(source.isAllowArrange()).isFalse();
    }

    @Test
    void forkOfShareAlikeKeepsTheLicense() {
        source.setLicense(ScoreLicense.CC_BY_SA);
        Score fork = Score.builder()
                .id("fork")
                .member(owner)
                .forkedFrom(source)
                .license(ScoreLicense.CC_BY_SA)
                .build();
        when(scoreRepository.findById("fork")).thenReturn(Optional.of(fork));
        ScoreUpdateRequest request = new ScoreUpdateRequest();
        request.setLicense(ScoreLicense.CC0);

        assertThatThrownBy(() -> service.updateScore("fork", request))
                .extracting(e -> ((AppException) e).getErrorCode())
                .isEqualTo(ScoreErrorCode.SCORE_LICENSE_LOCKED);
    }
}
