package com.ptit.music_be.service.auth;

import java.util.Map;

import com.ptit.music_be.dto.enums.auth.AppLocale;
import com.ptit.music_be.dto.enums.notification.NotificationCategory;
import com.ptit.music_be.dto.enums.team.TeamRole;
import com.ptit.music_be.dto.request.auth.SendEmailRequest;

public interface EmailService {

    void sendWelcomeEmail(SendEmailRequest request);

    void sendForgotPasswordEmail(String to, String otp);

    /** Báo cho chủ tài khoản biết mật khẩu vừa đổi (viaReset: đặt lại bằng OTP, ngược lại: đổi trong cài đặt). */
    void sendPasswordChangedEmail(String to, String fullName, boolean viaReset);

    /**
     * Lời mời vào team (mục 4.1): tên team, người mời, vai trò, link chấp nhận (hết hạn sau 7 ngày). Vai trò được dịch
     * theo ngôn ngữ của người nhận.
     */
    void sendTeamInvitationEmail(String to, String teamName, String inviterName, TeamRole role, String link);

    /**
     * Email tóm tắt thông báo chưa đọc hằng ngày (mục R8): số thông báo theo nhóm, ngôn ngữ của người nhận, nút mở trang
     * thông báo. Không kèm nội dung từng thông báo để không lộ tên bản nhạc, nhóm qua email.
     */
    void sendNotificationDigestEmail(String to, AppLocale locale, Map<NotificationCategory, Long> counts, String link);
}
