package com.ptit.music_be.service.score.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import jakarta.persistence.EntityManager;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.score.ScoreTrashRepository;
import com.ptit.music_be.service.score.ScoreCoverService;
import com.ptit.music_be.service.storage.ScoreStorageCleaner;

class ScoreTrashServiceImplTest {

    private final ScoreTrashRepository trashRepository = mock(ScoreTrashRepository.class);
    private final MemberRepository memberRepository = mock(MemberRepository.class);
    private final ScoreStorageCleaner cleaner = mock(ScoreStorageCleaner.class);
    private final ScoreCoverService coverService = mock(ScoreCoverService.class);
    private final EntityManager entityManager = mock(EntityManager.class);
    private final ScoreTrashServiceImpl service =
            new ScoreTrashServiceImpl(trashRepository, memberRepository, cleaner, coverService, 30);

    private final Member me = Member.builder().id("m1").email("a@x.com").build();

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(service, "entityManager", entityManager);
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("a@x.com", "x", "ROLE_USER"));
        when(memberRepository.findByEmail("a@x.com")).thenReturn(Optional.of(me));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private Score trashed(String id, LocalDateTime deletedAt, String deletedBy) {
        return Score.builder()
                .id(id)
                .title("Bài " + id)
                .member(me)
                .deletedAt(deletedAt)
                .deletedBy(deletedBy)
                .deleteReason("lý do")
                .build();
    }

    @Test
    void myTrashShowsPurgeDateAndWhoDeleted() {
        LocalDateTime deletedAt = LocalDateTime.of(2026, 11, 1, 10, 0);
        Score byMe = trashed("s1", deletedAt, "m1");
        Score byAdmin = trashed("s2", deletedAt, "admin");
        when(trashRepository.findTrashOfMember(eq("m1"), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(byMe, byAdmin)));

        var page = service.getMyTrash(0, 12);

        assertThat(page.getContent()).hasSize(2);
        assertThat(page.getContent().get(0).getPurgeAt()).isEqualTo(deletedAt.plusDays(30));
        assertThat(page.getContent().get(0).isDeletedByAdmin()).isFalse();
        assertThat(page.getContent().get(1).isDeletedByAdmin()).isTrue();
    }

    @Test
    void restoreClearsDeletionFields() {
        Score score = trashed("s1", LocalDateTime.now(), "m1");
        when(trashRepository.findTrashedByIdAndMember("s1", "m1")).thenReturn(Optional.of(score));

        service.restore("s1");

        assertThat(score.getDeletedAt()).isNull();
        assertThat(score.getDeletedBy()).isNull();
        assertThat(score.getDeleteReason()).isNull();
    }

    @Test
    void restoreOfScoreNotInMyTrashFails() {
        when(trashRepository.findTrashedByIdAndMember("s9", "m1")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.restore("s9"))
                .isInstanceOfSatisfying(
                        AppException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.SCORE_NOT_IN_TRASH));
    }

    @Test
    void purgeRemovesRowAndFiles() {
        Score score = trashed("s1", LocalDateTime.now(), "m1");
        when(trashRepository.findTrashedByIdAndMember("s1", "m1")).thenReturn(Optional.of(score));

        service.purge("s1");

        verify(entityManager).remove(score);
        verify(cleaner).deleteScoreDirAfterCommit("s1");
        // Không có ảnh bìa thì không gọi Cloudinary
        verify(coverService, never()).deleteQuietly("s1");
    }

    @Test
    void purgeAlsoDeletesCoverImageOnCloudinary() {
        Score score = trashed("s1", LocalDateTime.now(), "m1");
        score.setCoverUrl("https://res.cloudinary.com/demo/image/upload/score-covers/s1.png?v=1");
        when(trashRepository.findTrashedByIdAndMember("s1", "m1")).thenReturn(Optional.of(score));

        service.purge("s1");

        verify(coverService).deleteQuietly("s1");
    }

    @Test
    void purgeExpiredOnlyRemovesScoresPastRetention() {
        Score old = trashed("old", LocalDateTime.now().minusDays(31), "m1");
        Score recent = trashed("recent", LocalDateTime.now().minusDays(2), "m1");
        when(trashRepository.findTrashedById("old")).thenReturn(Optional.of(old));
        when(trashRepository.findTrashedById("recent")).thenReturn(Optional.of(recent));
        when(trashRepository.findTrashedById("gone")).thenReturn(Optional.empty());

        service.purgeExpired("old");
        service.purgeExpired("recent");
        service.purgeExpired("gone");

        verify(entityManager).remove(old);
        verify(entityManager, never()).remove(recent);
        verify(cleaner).deleteScoreDirAfterCommit("old");
        verify(cleaner, never()).deleteScoreDirAfterCommit("recent");
    }

    @Test
    void findExpiredIdsAsksForScoresOlderThanRetention() {
        when(trashRepository.findExpiredIds(any(LocalDateTime.class))).thenReturn(List.of("a", "b"));

        assertThat(service.findExpiredIds()).containsExactly("a", "b");
    }
}
