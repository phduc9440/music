package com.ptit.music_be.service.auth;

import com.ptit.music_be.dto.request.SendEmailRequest;

public interface EmailService {

    void sendWelcomeEmail(SendEmailRequest request);

    void sendForgotPasswordEmail(String to, String otp);

    /** Báo cho chủ tài khoản biết mật khẩu vừa đổi (viaReset: đặt lại bằng OTP, ngược lại: đổi trong cài đặt). */
    void sendPasswordChangedEmail(String to, String fullName, boolean viaReset);
}
