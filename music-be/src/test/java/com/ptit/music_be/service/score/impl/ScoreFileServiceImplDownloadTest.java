package com.ptit.music_be.service.score.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.dto.enums.score.FileType;
import com.ptit.music_be.dto.enums.score.SharePermission;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.MemberScore;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.mapper.ScoreFileMapper;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.score.MemberScoreRepository;
import com.ptit.music_be.repository.score.ScoreFileRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.service.permission.ScoreAccessAuditor;
import com.ptit.music_be.service.permission.impl.ScorePermissionServiceImpl;
import com.ptit.music_be.service.storage.FileStorageService;

/** Ai được tải file nào: chủ cho phép tải thì người xem tải MusicXML/MIDI/PDF; file gốc chỉ người có quyền sửa. */
class ScoreFileServiceImplDownloadTest {

    private final ScoreRepository scoreRepository = mock(ScoreRepository.class);
    private final ScoreFileRepository scoreFileRepository = mock(ScoreFileRepository.class);
    private final MemberScoreRepository shares = mock(MemberScoreRepository.class);
    private final MemberRepository members = mock(MemberRepository.class);
    private final FileStorageService storage = mock(FileStorageService.class);
    private final ScoreFileMapper mapper = mock(ScoreFileMapper.class);
    private final ScoreFileServiceImpl service = new ScoreFileServiceImpl(
            scoreRepository,
            scoreFileRepository,
            mapper,
            storage,
            new ScorePermissionServiceImpl(
                    shares, members, (score, memberId) -> Optional.empty(), mock(ScoreAccessAuditor.class)));

    private Score score;

    @BeforeEach
    void setUp() {
        score = Score.builder()
                .id("s1")
                .member(Member.builder().id("owner").email("owner@x.com").build())
                .visibility("PUBLIC")
                .build();
        when(scoreRepository.findById("s1")).thenReturn(Optional.of(score));
        when(shares.findByScoreIdAndMemberEmail(anyString(), anyString())).thenReturn(Optional.empty());
        when(members.findByEmail(anyString()))
                .thenReturn(Optional.of(Member.builder().id("m").build()));
        when(storage.loadAsResource(anyString())).thenReturn(new ByteArrayResource(new byte[] {1}));
        loginAs("viewer@x.com");
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private void loginAs(String email) {
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(email, "x", "ROLE_USER"));
    }

    private ScoreFile file(FileType type, Integer page) {
        ScoreFile file = ScoreFile.builder()
                .id("f-" + type + "-" + page)
                .score(score)
                .fileType(type)
                .pageNumber(page)
                .storagePath("scores/s1/x/" + type)
                .build();
        when(scoreFileRepository.findById(file.getId())).thenReturn(Optional.of(file));
        return file;
    }

    private void assertDenied(ScoreFile file, boolean inline) {
        assertThatThrownBy(() -> service.loadForDownload(file.getId(), inline))
                .isInstanceOfSatisfying(
                        AppException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.UNAUTHORIZED));
    }

    @Test
    void viewerCannotDownloadMusicXmlUntilOwnerAllowsIt() {
        ScoreFile xml = file(FileType.MUSICXML, null);

        assertDenied(xml, false);

        score.setAllowDownload(true);
        assertThat(service.loadForDownload(xml.getId(), false)).isNotNull();
    }

    @Test
    void viewerNeverDownloadsOriginalFilesEvenWhenDownloadIsAllowed() {
        score.setAllowDownload(true);

        assertDenied(file(FileType.ORIGINAL_PDF, null), false);
        assertDenied(file(FileType.ORIGINAL_MUSICXML, null), false);
        assertDenied(file(FileType.KERN, null), false);
        assertDenied(file(FileType.PNG, 2), false);
    }

    @Test
    void viewerSeesPageOneImageInlineAsThumbnailOnly() {
        assertThat(service.loadForDownload(file(FileType.PNG, 1).getId(), true)).isNotNull();
        assertDenied(file(FileType.PNG, 2), true);
        assertDenied(file(FileType.PNG, 1), false);
    }

    @Test
    void ownerDownloadsEverything() {
        loginAs("owner@x.com");

        assertThat(service.loadForDownload(file(FileType.ORIGINAL_PDF, null).getId(), false))
                .isNotNull();
        assertThat(service.loadForDownload(file(FileType.MUSICXML, null).getId(), false))
                .isNotNull();
    }

    @Test
    void sharedEditorDownloadsWithoutAllowDownload() {
        loginAs("editor@x.com");
        when(shares.findByScoreIdAndMemberEmail("s1", "editor@x.com"))
                .thenReturn(Optional.of(
                        MemberScore.builder().permission(SharePermission.EDIT).build()));

        assertThat(service.loadForDownload(file(FileType.ORIGINAL_PDF, null).getId(), false))
                .isNotNull();
        assertThat(service.canDownload(score)).isTrue();
    }

    @Test
    void filesListHidesOriginalsFromViewers() {
        ScoreFile xml = file(FileType.MUSICXML, null);
        ScoreFile pdf = file(FileType.ORIGINAL_PDF, null);
        when(scoreFileRepository.findByScoreIdOrderByFileTypeAscPageNumberAsc("s1"))
                .thenReturn(List.of(xml, pdf));
        when(mapper.toResponses(any())).thenReturn(List.of());

        service.getFilesOfScore("s1", null);

        verify(mapper).toResponses(List.of(xml));
    }

    @Test
    void canDownloadFollowsAllowDownloadFlag() {
        assertThat(service.canDownload(score)).isFalse();
        score.setAllowDownload(true);
        assertThat(service.canDownload(score)).isTrue();
        service.checkCanDownload(score);
    }

    @Test
    void checkCanDownloadThrowsWhenNotAllowed() {
        assertThatThrownBy(() -> service.checkCanDownload(score)).isInstanceOf(AppException.class);
    }
}
