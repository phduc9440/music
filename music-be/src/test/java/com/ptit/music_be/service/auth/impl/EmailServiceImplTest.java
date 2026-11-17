package com.ptit.music_be.service.auth.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.Properties;

import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.mail.javamail.JavaMailSender;

import com.ptit.music_be.dto.enums.auth.AppLocale;
import com.ptit.music_be.dto.enums.team.TeamRole;
import com.ptit.music_be.dto.request.auth.SendEmailRequest;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.repository.auth.MemberRepository;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class EmailServiceImplTest {

    @Mock
    JavaMailSender mailSender;

    @Mock
    MemberRepository memberRepository;

    EmailServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new EmailServiceImpl(mailSender, memberRepository);
        when(mailSender.createMimeMessage()).thenAnswer(i -> new MimeMessage(Session.getInstance(new Properties())));
    }

    private void member(String email, AppLocale locale) {
        when(memberRepository.findByEmail(email))
                .thenReturn(Optional.of(
                        Member.builder().id("m").email(email).locale(locale).build()));
    }

    private MimeMessage sent() throws Exception {
        ArgumentCaptor<MimeMessage> captor = ArgumentCaptor.forClass(MimeMessage.class);
        verify(mailSender).send(captor.capture());
        MimeMessage message = captor.getValue();
        message.saveChanges();
        return message;
    }

    /** Nội dung chữ của phần text/html (email gửi dạng nhiều phần nên không đọc thẳng được getContent()). */
    private static String html(jakarta.mail.Part part) throws Exception {
        if (part.isMimeType("text/*")) {
            return part.getContent().toString();
        }
        if (part.getContent() instanceof jakarta.mail.Multipart multipart) {
            StringBuilder all = new StringBuilder();
            for (int i = 0; i < multipart.getCount(); i++) {
                all.append(html(multipart.getBodyPart(i)));
            }
            return all.toString();
        }
        return "";
    }

    @Test
    void forgotPasswordUsesTheRecipientsLanguage() throws Exception {
        member("en@x.com", AppLocale.EN);
        service.sendForgotPasswordEmail("en@x.com", "123456");
        MimeMessage message = sent();
        assertThat(message.getSubject()).isEqualTo("Your Music App password reset code");
    }

    @Test
    void forgotPasswordFallsBackToVietnamese() throws Exception {
        member("vi@x.com", null);
        service.sendForgotPasswordEmail("vi@x.com", "123456");
        assertThat(sent().getSubject()).isEqualTo("Mã đặt lại mật khẩu Music App");
    }

    @Test
    void unknownRecipientGetsVietnamese() throws Exception {
        when(memberRepository.findByEmail("new@x.com")).thenReturn(Optional.empty());
        service.sendTeamInvitationEmail("new@x.com", "Ban nhạc", "An", TeamRole.ARRANGER, "https://x/y");
        assertThat(sent().getSubject()).isEqualTo("Lời mời tham gia nhóm Ban nhạc trên Music App");
    }

    @Test
    void teamInvitationTranslatesTheRoleForEnglishRecipients() throws Exception {
        member("en@x.com", AppLocale.EN);
        service.sendTeamInvitationEmail("en@x.com", "Band", "An", TeamRole.ARRANGER, "https://x/y");
        MimeMessage message = sent();
        assertThat(message.getSubject()).isEqualTo("Invitation to join the team Band on Music App");
        assertThat(html(message)).contains("Arranger").doesNotContain("Người phối");
    }

    @Test
    void welcomeEmailPrefersTheLocalePassedByTheCaller() throws Exception {
        // tài khoản vừa tạo có thể chưa commit nên tra DB không đáng tin: dùng ngôn ngữ truyền vào, không tra DB
        service.sendWelcomeEmail(SendEmailRequest.builder()
                .to("n@x.com")
                .fullName("Nam <b>")
                .locale(AppLocale.EN)
                .build());
        MimeMessage message = sent();
        assertThat(message.getSubject()).isEqualTo("Welcome to Music App");
        // tên người dùng nhập vào bị escape HTML
        assertThat(html(message)).doesNotContain("Nam <b>");
    }

    @Test
    void everyKeyHasTextInBothLanguages() {
        for (EmailMessages.Key key : EmailMessages.Key.values()) {
            assertThat(EmailMessages.text(AppLocale.VI, key, "a", "b", "c"))
                    .as("vi %s", key)
                    .isNotBlank();
            assertThat(EmailMessages.text(AppLocale.EN, key, "a", "b", "c"))
                    .as("en %s", key)
                    .isNotBlank();
        }
        for (TeamRole role : TeamRole.values()) {
            assertThat(EmailMessages.role(AppLocale.VI, role)).isNotBlank();
            assertThat(EmailMessages.role(AppLocale.EN, role)).isNotBlank();
        }
    }
}
