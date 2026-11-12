package com.ptit.music_be.service.auth.impl;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;

import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.util.HtmlUtils;

import com.ptit.music_be.dto.request.SendEmailRequest;
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

    /** Khung HTML chung cho mọi email: tiêu đề, nội dung, chữ ký. Escape các giá trị người dùng nhập trước khi ghép. */
    private static String layout(String heading, String body) {
        return "<div style=\"font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.6;max-width:560px\">"
                + "<h2 style=\"margin:0 0 12px\">" + heading + "</h2>"
                + body
                + "<p style=\"margin-top:24px;color:#475569\">Trân trọng,<br><strong>Đội ngũ Music App</strong></p>"
                + "</div>";
    }

    private static String escape(String value) {
        return HtmlUtils.htmlEscape(value == null ? "" : value);
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
        String name = escape(request.getFullName());
        send(
                request.getTo(),
                "Chào mừng bạn đến với Music App",
                layout(
                        "Xin chào " + name + ",",
                        "<p>Cảm ơn bạn đã đăng ký tài khoản Music App.</p>"
                                + "<p>Chúc bạn có những giờ luyện tập thật vui!</p>"),
                "Welcome");
    }

    @Override
    @Async
    public void sendForgotPasswordEmail(String to, String otp) {
        send(
                to,
                "Mã đặt lại mật khẩu Music App",
                layout(
                        "Đặt lại mật khẩu",
                        "<p>Bạn vừa yêu cầu đặt lại mật khẩu cho tài khoản Music App.</p>"
                                + "<p>Mã xác nhận (OTP) của bạn:</p>"
                                + "<p style=\"font-size:28px;font-weight:700;letter-spacing:6px;background:#f1f5f9;"
                                + "display:inline-block;padding:10px 18px;border-radius:8px;margin:4px 0\">"
                                + escape(otp) + "</p>"
                                + "<p>Mã có hiệu lực trong <strong>5 phút</strong> và chỉ dùng được một lần. "
                                + "Không chia sẻ mã này với bất kỳ ai, kể cả người tự xưng là nhân viên Music App.</p>"
                                + "<p style=\"color:#475569\">Nếu bạn không yêu cầu, hãy bỏ qua email này. Mật khẩu "
                                + "của bạn vẫn giữ nguyên.</p>"),
                "Forgot password");
    }

    @Override
    @Async
    public void sendPasswordChangedEmail(String to, String fullName, boolean viaReset) {
        String name = escape(fullName == null || fullName.isBlank() ? to : fullName);
        String time =
                java.time.LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("HH:mm dd/MM/yyyy"));
        send(
                to,
                "Mật khẩu Music App của bạn vừa được thay đổi",
                layout(
                        "Mật khẩu đã được thay đổi",
                        "<p>Xin chào " + name + ",</p>"
                                + "<p>Mật khẩu tài khoản Music App của bạn vừa được "
                                + (viaReset ? "đặt lại bằng mã OTP" : "đổi trong phần cài đặt tài khoản")
                                + " lúc <strong>" + time
                                + "</strong>. Các thiết bị đang đăng nhập khác đã bị đăng xuất.</p>"
                                + "<p style=\"color:#b91c1c\"><strong>Nếu không phải bạn thực hiện</strong>, hãy dùng "
                                + "chức năng “Quên mật khẩu” để đặt lại ngay và liên hệ quản trị viên.</p>"),
                "Password changed");
    }

    @Override
    @Async
    public void sendTeamInvitationEmail(
            String to, String teamName, String inviterName, String roleLabel, String link) {
        String safeLink = escape(link);
        send(
                to,
                "Lời mời tham gia team " + teamName + " trên Music App",
                layout(
                        "Bạn được mời vào team " + escape(teamName),
                        "<p><strong>" + escape(inviterName) + "</strong> mời bạn tham gia team <strong>"
                                + escape(teamName) + "</strong> với vai trò <strong>" + escape(roleLabel)
                                + "</strong>.</p>"
                                + "<p><a href=\"" + safeLink + "\" style=\"display:inline-block;background:#8a5a2b;"
                                + "color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none\">"
                                + "Xem lời mời</a></p>"
                                + "<p style=\"color:#475569\">Lời mời có hạn 7 ngày và chỉ dùng được một lần. Nếu chưa có"
                                + " tài khoản, hãy đăng ký bằng chính email này rồi mở lại link.</p>"),
                "Team invitation");
    }
}
