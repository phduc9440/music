package com.ptit.music_be.service.score.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import java.util.List;
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
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.dto.response.score.ScoreSummaryResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.score.ScoreFileRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.repository.score.ScoreTagRepository;

/** Thư viện sắp theo "Nhiều lượt xem" thì thẻ phải có số lượt xem để người dùng hiểu thứ tự. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ScoreServiceImplMyScoresViewCountTest {

    @Mock
    ScoreRepository scoreRepository;

    @Mock
    MemberRepository memberRepository;

    @Mock
    ScoreFileRepository scoreFileRepository;

    @Mock
    ScoreTagRepository scoreTagRepository;

    @InjectMocks
    ScoreServiceImpl service;

    private final Member owner =
            Member.builder().id("owner").email("owner@x.com").build();

    @BeforeEach
    void setUp() {
        when(memberRepository.findByEmail("owner@x.com")).thenReturn(Optional.of(owner));
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("owner@x.com", "x", "ROLE_USER"));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void myScoresCarryViewCount_nullCountsAsZero() {
        Score popular = Score.builder()
                .id("s1")
                .title("Nhiều")
                .member(owner)
                .viewCount(12L)
                .build();
        Score legacy = Score.builder()
                .id("s2")
                .title("Cũ")
                .member(owner)
                .viewCount(null)
                .build();
        when(scoreRepository.searchOfMember(
                        eq("owner"),
                        anyString(),
                        anyString(),
                        anyString(),
                        anyString(),
                        anyString(),
                        any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(popular, legacy)));

        List<ScoreSummaryResponse> content = service.getMyScores(0, 12, null, null, null, null, null, "views")
                .getContent();

        assertThat(content).extracting(ScoreSummaryResponse::getViewCount).containsExactly(12L, 0L);
    }
}
