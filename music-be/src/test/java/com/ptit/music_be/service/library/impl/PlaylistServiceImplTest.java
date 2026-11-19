package com.ptit.music_be.service.library.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
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
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.dto.request.library.PlaylistOrderRequest;
import com.ptit.music_be.dto.response.library.PlaylistItemResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Playlist;
import com.ptit.music_be.entity.PlaylistItem;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.library.PlaylistItemRepository;
import com.ptit.music_be.repository.library.PlaylistRepository;
import com.ptit.music_be.repository.score.ScoreRepository;

/** Bỏ nhiều bài khỏi playlist cùng lúc: bỏ hết hoặc không bỏ gì, đánh lại thứ tự. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PlaylistServiceImplTest {

    @Mock
    PlaylistRepository playlistRepository;

    @Mock
    PlaylistItemRepository playlistItemRepository;

    @Mock
    ScoreRepository scoreRepository;

    @Mock
    MemberRepository memberRepository;

    @InjectMocks
    PlaylistServiceImpl service;

    Member me;
    Playlist playlist;
    List<PlaylistItem> stored;

    @BeforeEach
    void setUp() {
        me = Member.builder().id("m1").email("me@x.com").build();
        playlist = Playlist.builder().id("pl-1").member(me).name("Luyện ngón").build();
        stored = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            Score score = Score.builder().id("s" + i).title("Bài " + i).build();
            PlaylistItem item = PlaylistItem.builder()
                    .id("it" + i)
                    .playlist(playlist)
                    .score(score)
                    .position(i)
                    .build();
            stored.add(item);
            playlist.getPlaylistItems().add(item);
        }
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("me@x.com", "x", "ROLE_USER"));
        when(memberRepository.findByEmail("me@x.com")).thenReturn(Optional.of(me));
        when(playlistRepository.findById("pl-1")).thenReturn(Optional.of(playlist));
        when(playlistItemRepository.findByPlaylistOrderByPositionAsc(playlist))
                .thenAnswer(inv -> new ArrayList<>(stored));
        org.mockito.Mockito.doAnswer(inv -> stored.remove((PlaylistItem) inv.getArgument(0)))
                .when(playlistItemRepository)
                .delete(any(PlaylistItem.class));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private static PlaylistOrderRequest ids(String... scoreIds) {
        return PlaylistOrderRequest.builder().scoreIds(List.of(scoreIds)).build();
    }

    private ErrorCode errorOf(Runnable action) {
        return catchThrowableOfType(AppException.class, action::run).getErrorCode();
    }

    @Test
    void removeManyRemovesChosenAndRenumbers() {
        List<PlaylistItemResponse> left = service.removeScores("pl-1", ids("s0", "s2"));

        assertThat(left).extracting(PlaylistItemResponse::getScoreId).containsExactly("s1");
        assertThat(left).extracting(PlaylistItemResponse::getPosition).containsExactly(1); // thứ tự đánh từ 1
        assertThat(playlist.getPlaylistItems()).extracting(PlaylistItem::getId).containsExactly("it1");
    }

    @Test
    void removeManyRejectsUnknownIdWithoutRemovingAnything() {
        assertThat(errorOf(() -> service.removeScores("pl-1", ids("s0", "nope"))))
                .isEqualTo(ErrorCode.PLAYLIST_SCORE_NOT_IN_PLAYLIST);
        verify(playlistItemRepository, never()).delete(any());
        assertThat(stored).hasSize(3);
    }

    @Test
    void removeManyRejectsEmptyList() {
        assertThat(errorOf(() -> service.removeScores("pl-1", ids())))
                .isEqualTo(ErrorCode.PLAYLIST_SCORE_NOT_IN_PLAYLIST);
        assertThat(errorOf(() -> service.removeScores("pl-1", null)))
                .isEqualTo(ErrorCode.PLAYLIST_SCORE_NOT_IN_PLAYLIST);
    }

    @Test
    void removeManyOnSomeoneElsesPlaylistIsNotFound() {
        playlist.setMember(Member.builder().id("other").build());

        assertThat(errorOf(() -> service.removeScores("pl-1", ids("s0")))).isEqualTo(ErrorCode.PLAYLIST_NOT_EXISTED);
        verify(playlistItemRepository, never()).delete(any());
    }
}
