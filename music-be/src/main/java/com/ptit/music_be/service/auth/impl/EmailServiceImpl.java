package com.ptit.music_be.service.auth.impl;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;

import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.util.HtmlUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

import com.ptit.music_be.dto.enums.auth.AppLocale;
import com.ptit.music_be.dto.enums.team.TeamRole;
import com.ptit.music_be.dto.request.auth.SendEmailRequest;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.service.auth.impl.EmailMessages.Key;
import com.ptit.music_be.service.auth.EmailService;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Slf4j
public class EmailServiceImpl implements EmailService {

    JavaMailSender javaMailSender;
    MemberRepository memberRepository;

    /** Khung HTML chung cho mọi email: tiêu đề, nội dung, chữ ký. Escape các giá trị người dùng nhập trước khi ghép. */
    private static String layout(AppLocale locale, String heading, String body) {
        return "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.6;max-width:560px\">"
                + "<h2 style=\"margin:0 0 12px\">" + heading + "</h2>"
                + body
                + "<p style=\"margin-top:24px;color:#475569\">" + EmailMessages.text(locale, Key.SIGNOFF) + "</p>"
                + "</div>";
    }

    private static String escape(String value) {
        return HtmlUtils.htmlEscape(value == null ? "" : value);
    }

    /**
     * Ngôn ngữ của người nhận: lấy từ {@code members.locale} theo email; chưa chọn hoặc chưa có tài khoản (ví dụ lời mời
     * gửi tới người chưa đăng ký) thì tiếng Việt.
     */
    private AppLocale localeOf(String email) {
        if (email == null) {
            return AppLocale.VI;
        }
        return memberRepository
                .findByEmail(email.trim().toLowerCase())
                .map(m -> m.getLocale() == null ? AppLocale.VI : m.getLocale())
                .orElse(AppLocale.VI);
    }

    private void send(String to, String subject, String html, String kind) {
        try {
            MimeMessage message = javaMailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(html, true);
            javaMailSender.send(message);
            log.info("{} email sent to {}", kind, to);
        } catch (MessagingException | RuntimeException e) {
            log.error("Failed to send {} email to {}", kind, to, e);
        }
    }

    @Override
    @Async
    public void sendWelcomeEmail(SendEmailRequest request) {
        // Chạy bất đồng bộ, có thể trước khi tài khoản mới commit: ưu tiên ngôn ngữ do nơi gọi truyền sẵn
        AppLocale locale = request.getLocale() != null ? request.getLocale() : localeOf(request.getTo());
        String name = escape(request.getFullName());
        send(
                request.getTo(),
                EmailMessages.text(locale, Key.WELCOME_SUBJECT),
                layout(
                        locale,
                        EmailMessages.text(locale, Key.WELCOME_HEADING, name),
                        EmailMessages.text(locale, Key.WELCOME_BODY)),
                "Welcome");
    }

    @Override
    @Async
    public void sendForgotPasswordEmail(String to, String otp) {
        AppLocale locale = localeOf(to);
        send(
                to,
                EmailMessages.text(locale, Key.FORGOT_SUBJECT),
                layout(
                        locale,
                        EmailMessages.text(locale, Key.FORGOT_HEADING),
                        EmailMessages.text(locale, Key.FORGOT_INTRO)
                                + EmailMessages.text(locale, Key.FORGOT_CODE_LABEL)
                                + "<p style=\"font-size:28px;font-weight:700;letter-spacing:6px;background:#f1f5f9;"
                                + "display:inline-block;padding:10px 18px;border-radius:8px;margin:4px 0\">"
                                + escape(otp) + "</p>"
                                + EmailMessages.text(locale, Key.FORGOT_VALIDITY)
                                + EmailMessages.text(locale, Key.FORGOT_IGNORE)),
                "Forgot password");
    }

    @Override
    @Async
    public void sendPasswordChangedEmail(String to, String fullName, boolean viaReset) {
        AppLocale locale = localeOf(to);
        String name = escape(fullName == null || fullName.isBlank() ? to : fullName);
        String time = LocalDateTime.now().format(DateTimeFormatter.ofPattern("HH:mm dd/MM/yyyy"));
        String how = EmailMessages.text(locale, viaReset ? Key.CHANGED_VIA_RESET : Key.CHANGED_VIA_SETTINGS);
        send(
                to,
                EmailMessages.text(locale, Key.CHANGED_SUBJECT),
                layout(
                        locale,
                        EmailMessages.text(locale, Key.CHANGED_HEADING),
                        EmailMessages.text(locale, Key.CHANGED_HELLO, name)
                                + EmailMessages.text(locale, Key.CHANGED_BODY, how, time)
                                + EmailMessages.text(locale, Key.CHANGED_WARNING)),
                "Password changed");
    }

    @Override
    @Async
    public void sendTeamInvitationEmail(String to, String teamName, String inviterName, TeamRole role, String link) {
        AppLocale locale = localeOf(to);
        String safeLink = escape(link);
        send(
                to,
                EmailMessages.text(locale, Key.INVITE_SUBJECT, teamName),
                layout(
                        locale,
                        EmailMessages.text(locale, Key.INVITE_HEADING, escape(teamName)),
                        EmailMessages.text(
                                        locale,
                                        Key.INVITE_BODY,
                                        escape(inviterName),
                                        escape(teamName),
                                        escape(EmailMessages.role(locale, role)))
                                + "<p><a href=\"" + safeLink + "\" style=\"display:inline-block;background:#8a5a2b;"
                                + "color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none\">"
                                + EmailMessages.text(locale, Key.INVITE_BUTTON) + "</a></p>"
                                + EmailMessages.text(locale, Key.INVITE_FOOTER)),
                "Team invitation");
    }
}
