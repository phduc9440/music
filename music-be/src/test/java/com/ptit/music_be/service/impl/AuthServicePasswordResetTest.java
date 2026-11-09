package com.ptit.music_be.service.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
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
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Otp;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.mapper.MemberMapper;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.MemberRoleRepository;
import com.ptit.music_be.repository.OtpRepository;
import com.ptit.music_be.repository.RoleRepository;
import com.ptit.music_be.service.EmailService;

/** Luồng quên mật khẩu bằng OTP: băm mã, giới hạn theo email, lỗi riêng, thu hồi phiên cũ, mail báo đổi mật khẩu. */
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

    private ResetPasswordRequest reset(String otp, String password) {
        ResetPasswordRequest r = new ResetPasswordRequest();
        r.setEmail("a@x.com");
        r.setOtp(otp);
        r.setNewPassword(password);
        return r;
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
    void correctOtpChangesPasswordRevokesOldSessionsAndNotifies() {
        Otp otp = Otp.builder()
                .otpCode(encoder.encode("123456"))
                .expiryTime(LocalDateTime.now().plusMinutes(5))
                .member(user)
                .build();
        when(members.findByEmail("a@x.com")).thenReturn(Optional.of(user));
        when(otps.findByMember(user)).thenReturn(Optional.of(otp));

        service.resetPassword(reset("123456", "new-password-1"));

        assertTrue(encoder.matches("new-password-1", user.getPasswordHash()));
        assertNotNull(user.getPasswordChangedAt());
        assertEquals(0, user.getPasswordChangedAt().getNano()); // làm tròn xuống giây như iat của JWT
        verify(guard).evict("a@x.com");
        verify(otps).delete(otp);
        verify(email).sendPasswordChangedEmail("a@x.com", "An", true);
    }

    @Test
    void wrongOtpCountsAnAttemptAndUsesTheOtpError() {
        Otp otp = Otp.builder()
                .otpCode(encoder.encode("123456"))
                .expiryTime(LocalDateTime.now().plusMinutes(5))
                .member(user)
                .build();
        when(members.findByEmail("a@x.com")).thenReturn(Optional.of(user));
        when(otps.findByMember(user)).thenReturn(Optional.of(otp));

        AppException e = assertThrows(AppException.class, () -> service.resetPassword(reset("654321", "new-password-1")));

        assertEquals(ErrorCode.OTP_INVALID, e.getErrorCode());
        assertEquals(1, otp.getAttempts());
        assertTrue(encoder.matches("old-password", user.getPasswordHash()));
        verify(email, never()).sendPasswordChangedEmail(anyString(), any(), anyBoolean());
    }

    @Test
    void expiredOtpOrUnknownEmailUseTheSameOtpError() {
        Otp expired = Otp.builder()
                .otpCode(encoder.encode("123456"))
                .expiryTime(LocalDateTime.now().minusSeconds(1))
                .member(user)
                .build();
        when(members.findByEmail("a@x.com")).thenReturn(Optional.of(user));
        when(otps.findByMember(user)).thenReturn(Optional.of(expired));
        assertEquals(
                ErrorCode.OTP_INVALID,
                assertThrows(AppException.class, () -> service.resetPassword(reset("123456", "new-password-1")))
                        .getErrorCode());
        verify(otps).delete(expired);

        when(members.findByEmail("a@x.com")).thenReturn(Optional.empty());
        assertEquals(
                ErrorCode.OTP_INVALID,
                assertThrows(AppException.class, () -> service.resetPassword(reset("123456", "new-password-1")))
                        .getErrorCode());
    }
}
