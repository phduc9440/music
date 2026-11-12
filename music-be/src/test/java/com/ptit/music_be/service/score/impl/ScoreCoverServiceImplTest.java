package com.ptit.music_be.service.score.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.Map;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

import com.cloudinary.Cloudinary;
import com.cloudinary.Uploader;
import com.ptit.music_be.dto.response.ScoreDetailResponse;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.score.ScoreCoverService;

/** Ảnh bìa bản nhạc với DB thật (dữ liệu mẫu: user@music.com là chủ "Ode to Joy"); Cloudinary được giả lập. Mỗi test rollback. */
@SpringBootTest
@Transactional
class ScoreCoverServiceImplTest {

    static final String OWNER = "user@music.com";
    static final String STRANGER = "lan.nguyen@music.com";
    static final String URL = "https://res.cloudinary.com/demo/image/upload/score-covers/x.png";

    @Autowired
    ScoreCoverService coverService;

    @Autowired
    ScoreRepository scoreRepository;

    @Autowired
    MemberRepository memberRepository;

    @MockitoBean
    Cloudinary cloudinary;

    Uploader uploader;
    String scoreId;

    @BeforeEach
    void setUp() {
        uploader = org.mockito.Mockito.mock(Uploader.class);
        when(cloudinary.uploader()).thenReturn(uploader);
        scoreId = scoreRepository.findAll().stream()
                .filter(s -> s.getMember() != null
                        && OWNER.equals(s.getMember().getEmail())
                        && "Ode to Joy".equals(s.getTitle()))
                .findFirst()
                .orElseThrow()
                .getId();
        as(OWNER);
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private static void as(String email) {
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(email, "x", "ROLE_USER"));
    }

    private static byte[] png() throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(20, 20, BufferedImage.TYPE_INT_RGB), "png", out);
        return out.toByteArray();
    }

    private static ErrorCode codeOf(Runnable action) {
        return assertThrows(AppException.class, action::run).getErrorCode();
    }

    @Test
    void ownerUploadsCoverThenReplacesAndRemovesIt() throws Exception {
        when(uploader.upload(any(byte[].class), anyMap())).thenReturn(Map.of("secure_url", URL));

        ScoreDetailResponse up =
                coverService.upload(scoreId, new MockMultipartFile("file", "a.png", "image/png", png()));
        assertTrue(up.getCoverUrl().startsWith(URL + "?v="));
        assertTrue(scoreRepository.findById(scoreId).orElseThrow().getCoverUrl().startsWith(URL));

        // Mỗi bản nhạc một public id cố định, ghi đè khi tải lại
        verify(uploader).upload(any(byte[].class), eq(Map.of(
                "public_id", "score-covers/" + scoreId,
                "overwrite", true,
                "invalidate", true,
                "resource_type", "image")));

        ScoreDetailResponse removed = coverService.remove(scoreId);
        assertNull(removed.getCoverUrl());
        verify(uploader).destroy(eq("score-covers/" + scoreId), anyMap());
    }

    @Test
    void rejectsBadFilesAndNeverCallsCloudinary() throws Exception {
        assertEquals(
                ErrorCode.SCORE_COVER_INVALID,
                codeOf(() -> coverService.upload(scoreId, new MockMultipartFile("file", "a.gif", "image/gif", new byte[] {1}))));
        // Content-Type nói là PNG nhưng nội dung không phải ảnh
        assertEquals(
                ErrorCode.SCORE_COVER_INVALID,
                codeOf(() -> coverService.upload(scoreId, new MockMultipartFile("file", "a.png", "image/png", new byte[] {1, 2, 3}))));
        // Quá 3MB
        assertEquals(
                ErrorCode.SCORE_COVER_INVALID,
                codeOf(() -> coverService.upload(scoreId, new MockMultipartFile("file", "a.png", "image/png", new byte[3 * 1024 * 1024 + 1]))));
        verify(uploader, never()).upload(any(byte[].class), anyMap());
    }

    @Test
    void personWithoutEditPermissionCannotChangeCover() throws Exception {
        as(STRANGER);
        assertEquals(
                ErrorCode.UNAUTHORIZED,
                codeOf(() -> {
                    try {
                        coverService.upload(scoreId, new MockMultipartFile("file", "a.png", "image/png", png()));
                    } catch (AppException e) {
                        throw e;
                    } catch (Exception e) {
                        throw new IllegalStateException(e);
                    }
                }));
        assertEquals(ErrorCode.UNAUTHORIZED, codeOf(() -> coverService.remove(scoreId)));
        verify(uploader, never()).upload(any(byte[].class), anyMap());
    }

    @Test
    void storageFailureKeepsOldCover() throws Exception {
        when(uploader.upload(any(byte[].class), anyMap())).thenThrow(new RuntimeException("cloud down"));
        assertEquals(
                ErrorCode.FILE_STORAGE_ERROR,
                codeOf(() -> {
                    try {
                        coverService.upload(scoreId, new MockMultipartFile("file", "a.png", "image/png", png()));
                    } catch (AppException e) {
                        throw e;
                    } catch (Exception e) {
                        throw new IllegalStateException(e);
                    }
                }));
        assertNull(scoreRepository.findById(scoreId).orElseThrow().getCoverUrl());
    }
}
