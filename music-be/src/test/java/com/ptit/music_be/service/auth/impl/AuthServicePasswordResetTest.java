package com.ptit.music_be.service.auth.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import com.ptit.music_be.configuration.MemberStatusGuard;
import com.ptit.music_be.configuration.OtpRequestLimiter;
import com.ptit.music_be.dto.enums.AuthProvider;
import com.ptit.music_be.dto.enums.MemberStatus;
import com.ptit.music_be.dto.request.ForgotPasswordRequest;
import com.ptit.music_be.dto.request.ResetPasswordRequest;
import com.ptit.music_be.dto.request.VerifyResetOtpRequest;
import com.ptit.music_be.dto.response.VerifyResetOtpResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Otp;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.mapper.MemberMapper;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.MemberRoleRepository;
import com.ptit.music_be.repository.OtpRepository;
import com.ptit.music_be.repository.RoleRepository;
import com.ptit.music_be.service.auth.EmailService;

/**
 * Luồng quên mật khẩu ba bước: gửi OTP (băm mã, giới hạn theo email), xác minh OTP lấy mã phiên dùng một lần, đặt mật khẩu
 * mới bằng mã phiên (thu hồi phiên cũ, mail báo đổi mật khẩu).
 */
class AuthServicePasswordResetTest {

    private final MemberRepository members = mock(MemberRepository.class);
    private final OtpRepository otps = mock(OtpRepository.class);
    private final EmailService email = mock(EmailService.class);
    private final MemberStatusGuard guard = mock(MemberStatusGuard.class);
    private final OtpRequestLimiter limiter = mock(OtpRequestLimiter.class);
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(4);
    private final AuthServiceImpl service = new AuthServiceImpl(
            members,
            mock(RoleRepository.class),
            mock(MemberRoleRepository.class),
            mock(MemberMapper.class),
            encoder,
            email,
            otps,
            guard,
            limiter);

    private final Member user = Member.builder()
            .id("m1")
            .email("a@x.com")
            .fullName("An")
            .status(MemberStatus.ACTIVE)
            .authProvider(AuthProvider.LOCAL)
            .passwordHash(encoder.encode("old-password"))
            .build();

    private ForgotPasswordRequest forgot(String mail) {
        ForgotPasswordRequest r = new ForgotPasswordRequest();
        r.setEmail(mail);
        return r;
    }

    private VerifyResetOtpRequest otpOf(String otp) {
        return new VerifyResetOtpRequest("a@x.com", otp);
    }

    private ResetPasswordRequest reset(String token, String password) {
        ResetPasswordRequest r = new ResetPasswordRequest();
        r.setEmail("a@x.com");
        r.setResetToken(token);
        r.setNewPassword(password);
        return r;
    }

    private Otp pendingOtp(String code, LocalDateTime expiry) {
        return Otp.builder().otpCode(encoder.encode(code)).expiryTime(expiry).member(user).build();
    }

    @Test
    void forgotStoresOnlyAHashOfTheOtpAndEmailsThePlainCode() {
        when(members.findByEmail("a@x.com")).thenReturn(Optional.of(user));

        service.forgotPassword(forgot(" A@x.com "));

        ArgumentCaptor<Otp> saved = ArgumentCaptor.forClass(Otp.class);
        verify(otps).save(saved.capture());
        ArgumentCaptor<String> sent = ArgumentCaptor.forClass(String.class);
        verify(email).sendForgotPasswordEmail(eq("a@x.com"), sent.capture());
        assertEquals(6, sent.getValue().length());
        assertNotEquals(sent.getValue(), saved.getValue().getOtpCode());
        assertTrue(encoder.matches(sent.getValue(), saved.getValue().getOtpCode()));
        verify(limiter).acquire("a@x.com");
    }

    @Test
    void limiterAppliesEvenToUnknownEmailsSoResponsesDoNotRevealAccounts() {
        when(members.findByEmail("ghost@x.com")).thenReturn(Optional.empty());
        service.forgotPassword(forgot("ghost@x.com"));
        verify(limiter).acquire("ghost@x.com");
        verify(email, never()).sendForgotPasswordEmail(anyString(), anyString());

        doThrow(new AppException(ErrorCode.OTP_REQUEST_TOO_SOON)).when(limiter).acquire("ghost@x.com");
        AppException e = assertThrows(AppException.class, () -> service.forgotPassword(forgot("ghost@x.com")));
        assertEquals(ErrorCode.OTP_REQUEST_TOO_SOON, e.getErrorCode());
    }

    @Test
    void correctOtpGivesAOneTimeResetTokenButDoesNotChangeThePassword() {
        Otp otp = pendingOtp("123456", LocalDateTime.now().plusMinutes(5));
        when(members.findByEmail("a@x.com")).thenReturn(Optional.of(user));
        when(otps.findByMember(user)).thenReturn(Optional.of(otp));

        VerifyResetOtpResponse res = service.verifyResetOtp(otpOf(" 123456 "));

        assertNotNull(res.getResetToken());
        assertTrue(res.getResetToken().length() >= 40);
        assertEquals(600, res.getExpiresInSeconds());
        // Chỉ lưu bản băm của mã phiên, hạn mới 10 phút; mật khẩu chưa đổi
        assertNotNull(otp.getResetTokenHash());
        assertNotEquals(res.getResetToken(), otp.getResetTokenHash());
        assertTrue(otp.getExpiryTime().isAfter(LocalDateTime.now().plusMinutes(9)));
        assertTrue(encoder.matches("old-password", user.getPasswordHash()));
        verify(email, never()).sendPasswordChangedEmail(anyString(), any(), anyBoolean());

        // OTP đã đổi thành mã phiên thì nhập lại OTP không được nữa
        assertEquals(
                ErrorCode.OTP_INVALID,
                assertThrows(AppException.class, () -> service.verifyResetOtp(otpOf("123456"))).getErrorCode());
    }

    @Test
    void resetTokenChangesPasswordOnceRevokesOldSessionsAndNotifies() {
        Otp otp = pendingOtp("123456", LocalDateTime.now().plusMinutes(5));
        when(members.findByEmail("a@x.com")).thenReturn(Optional.of(user));
        when(otps.findByMember(user)).thenReturn(Optional.of(otp));
        String token = service.verifyResetOtp(otpOf("123456")).getResetToken();

        service.resetPassword(reset(token, "new-password-1"));

        assertTrue(encoder.matches("new-password-1", user.getPasswordHash()));
        assertNotNull(user.getPasswordChangedAt());
        assertEquals(0, user.getPasswordChangedAt().getNano()); // làm tròn xuống giây như iat của JWT
        verify(guard).evict("a@x.com");
        verify(otps).delete(otp);
        verify(email).sendPasswordChangedEmail("a@x.com", "An", true);
    }

    @Test
    void resetPasswordRejectsTheOtpItselfAWrongTokenOrAnExpiredSession() {
        Otp otp = pendingOtp("123456", LocalDateTime.now().plusMinutes(5));
        when(members.findByEmail("a@x.com")).thenReturn(Optional.of(user));
        when(otps.findByMember(user)).thenReturn(Optional.of(otp));

        // Chưa xác minh OTP: gửi thẳng OTP vào bước đặt mật khẩu bị từ chối (không còn để chung như trước)
        assertEquals(
                ErrorCode.RESET_SESSION_INVALID,
                assertThrows(AppException.class, () -> service.resetPassword(reset("123456", "new-password-1")))
                        .getErrorCode());

        service.verifyResetOtp(otpOf("123456"));
        assertEquals(
                ErrorCode.RESET_SESSION_INVALID,
                assertThrows(AppException.class, () -> service.resetPassword(reset("wrong-token", "new-password-1")))
                        .getErrorCode());

        otp.setExpiryTime(LocalDateTime.now().minusSeconds(1));
        assertEquals(
                ErrorCode.RESET_SESSION_INVALID,
                assertThrows(AppException.class, () -> service.resetPassword(reset("any", "new-password-1")))
                        .getErrorCode());
        verify(otps).delete(otp);
        assertTrue(encoder.matches("old-password", user.getPasswordHash()));
        verify(email, never()).sendPasswordChangedEmail(anyString(), any(), anyBoolean());
    }

    @Test
    void wrongOtpCountsAnAttemptAndUsesTheOtpError() {
        Otp otp = pendingOtp("123456", LocalDateTime.now().plusMinutes(5));
        when(members.findByEmail("a@x.com")).thenReturn(Optional.of(user));
        when(otps.findByMember(user)).thenReturn(Optional.of(otp));

        AppException e = assertThrows(AppException.class, () -> service.verifyResetOtp(otpOf("654321")));

        assertEquals(ErrorCode.OTP_INVALID, e.getErrorCode());
        assertEquals(1, otp.getAttempts());
        assertNull(otp.getResetTokenHash());
    }

    @Test
    void fiveWrongOtpsCancelTheCode() {
        Otp otp = pendingOtp("123456", LocalDateTime.now().plusMinutes(5));
        otp.setAttempts(5);
        when(members.findByEmail("a@x.com")).thenReturn(Optional.of(user));
        when(otps.findByMember(user)).thenReturn(Optional.of(otp));

        // Đúng mã nhưng đã sai đủ 5 lần: mã bị hủy, phải xin mã mới
        assertEquals(
                ErrorCode.OTP_INVALID,
                assertThrows(AppException.class, () -> service.verifyResetOtp(otpOf("123456"))).getErrorCode());
        verify(otps).delete(otp);
    }

    @Test
    void expiredOtpOrUnknownEmailUseTheSameOtpError() {
        Otp expired = pendingOtp("123456", LocalDateTime.now().minusSeconds(1));
        when(members.findByEmail("a@x.com")).thenReturn(Optional.of(user));
        when(otps.findByMember(user)).thenReturn(Optional.of(expired));
        assertEquals(
                ErrorCode.OTP_INVALID,
                assertThrows(AppException.class, () -> service.verifyResetOtp(otpOf("123456"))).getErrorCode());
        verify(otps).delete(expired);

        when(members.findByEmail("a@x.com")).thenReturn(Optional.empty());
        assertEquals(
                ErrorCode.OTP_INVALID,
                assertThrows(AppException.class, () -> service.verifyResetOtp(otpOf("123456"))).getErrorCode());
    }
}
