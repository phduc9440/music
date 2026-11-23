package com.ptit.music_be.service.score.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.event.ScoreImportedEvent;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.code.BillingErrorCode;
import com.ptit.music_be.mapper.ScoreFileMapper;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.library.TagRepository;
import com.ptit.music_be.repository.score.ScoreFileRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.service.billing.EntitlementService;
import com.ptit.music_be.service.storage.FileStorageService;

/** Nhập file MIDI phát sự kiện để tự chuyển sang MusicXML (mục I2); file MusicXML thì không. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ScoreImportServiceImplMidiEventTest {

    @Mock
    MemberRepository memberRepository;

    @Mock
    TagRepository tagRepository;

    @Mock
    ScoreRepository scoreRepository;

    @Mock
    ScoreFileRepository scoreFileRepository;

    @Mock
    FileStorageService fileStorageService;

    @Mock
    ScoreFileMapper scoreFileMapper;

    @Mock
    ApplicationEventPublisher eventPublisher;

    @Mock
    EntitlementService entitlementService;

    @InjectMocks
    ScoreImportServiceImpl service;

    private final Member me = Member.builder().id("me").email("me@x.com").build();

    @BeforeEach
    void setUp() {
        TransactionSynchronizationManager.initSynchronization();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("me@x.com", "x", "ROLE_USER"));
        when(memberRepository.findByEmail("me@x.com")).thenReturn(Optional.of(me));
        when(scoreRepository.save(any(Score.class))).thenAnswer(inv -> {
            Score s = inv.getArgument(0);
            s.setId("s1");
            return s;
        });
        when(scoreFileRepository.save(any(ScoreFile.class))).thenAnswer(inv -> inv.getArgument(0));
        when(fileStorageService.store(any(), any())).thenAnswer(inv -> inv.getArgument(1));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
        TransactionSynchronizationManager.clearSynchronization();
    }

    private static byte[] midi() {
        // MThd, độ dài 6, format 0, 1 track, division 96
        return new byte[] {'M', 'T', 'h', 'd', 0, 0, 0, 6, 0, 0, 0, 1, 0, 96};
    }

    @Test
    void importingMidiPublishesTheEventSoItIsConvertedAutomatically() {
        service.importScore(new MockMultipartFile("file", "bai.mid", "audio/midi", midi()), null, null, null);

        ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
        verify(eventPublisher).publishEvent(captor.capture());
        assertThat(captor.getValue()).isEqualTo(new ScoreImportedEvent("s1", "me", true));
    }

    @Test
    void importingMusicXmlPublishesNothing() {
        String xml = "<?xml version=\"1.0\"?><score-partwise version=\"3.1\"><part-list><score-part id=\"P1\">"
                + "<part-name>P</part-name></score-part></part-list><part id=\"P1\"><measure number=\"1\"/></part>"
                + "</score-partwise>";

        service.importScore(
                new MockMultipartFile("file", "bai.musicxml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)),
                null,
                null,
                null);

        verify(eventPublisher, never()).publishEvent(any(Object.class));
    }

    @Test
    void importFailsBeforeAnythingIsSavedWhenTheStorageQuotaIsFull() {
        doThrow(new AppException(BillingErrorCode.PLAN_LIMIT_REACHED))
                .when(entitlementService)
                .checkStorage(eq("me"), anyLong());

        AppException e = assertThrows(
                AppException.class,
                () -> service.importScore(
                        new MockMultipartFile("file", "bai.mid", "audio/midi", midi()), null, null, null));

        assertThat(e.getErrorCode()).isEqualTo(BillingErrorCode.PLAN_LIMIT_REACHED);
        verify(scoreRepository, never()).save(any(Score.class));
        verify(entitlementService).checkStorage("me", midi().length);
    }
}
