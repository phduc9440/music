package com.ptit.music_be.service.impl;

import com.ptit.music_be.dto.request.SendEmailRequest;
import com.ptit.music_be.service.EmailService;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Slf4j
public class EmailServiceImpl implements EmailService {

	JavaMailSender javaMailSender;

	@Override
	@Async
	public void sendWelcomeEmail(SendEmailRequest request) {
		try {
			MimeMessage message = javaMailSender.createMimeMessage();
			MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");

			helper.setTo(request.getTo());
			helper.setSubject("Welcome to Music App! 🎵");

			String htmlContent = "<h2>Hello " + request.getFullName() + ",</h2>" +
					"<p>Thank you for registering an account at Music App.</p>" +
					"<p>We hope you enjoy your time with us!</p>" +
					"<br>" +
					"<p>Best regards,</p>" +
					"<p><strong>The Music App Team</strong></p>";

			helper.setText(htmlContent, true);

			javaMailSender.send(message);
			log.info("Welcome email sent successfully to {}", request.getTo());

		} catch (MessagingException e) {
			log.error("Failed to send welcome email to {}", request.getTo(), e);
		}
	}
}
