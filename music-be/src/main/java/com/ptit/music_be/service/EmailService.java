package com.ptit.music_be.service;

import com.ptit.music_be.dto.request.SendEmailRequest;

public interface EmailService {

    void sendWelcomeEmail(SendEmailRequest request);

    void sendForgotPasswordEmail(String to, String otp);
}
