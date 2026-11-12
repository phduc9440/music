package com.ptit.music_be.service.auth;

import com.ptit.music_be.dto.request.ChangePasswordRequest;
import com.ptit.music_be.dto.request.ForgotPasswordRequest;
import com.ptit.music_be.dto.request.GoogleLoginRequest;
import com.ptit.music_be.dto.request.LoginRequest;
import com.ptit.music_be.dto.request.RefreshRequest;
import com.ptit.music_be.dto.request.RegisterRequest;
import com.ptit.music_be.dto.request.ResetPasswordRequest;
import com.ptit.music_be.dto.request.VerifyResetOtpRequest;
import com.ptit.music_be.dto.response.AuthResponse;
import com.ptit.music_be.dto.response.MemberResponse;
import com.ptit.music_be.dto.response.VerifyResetOtpResponse;

public interface AuthService {

    MemberResponse register(RegisterRequest request);

    AuthResponse login(LoginRequest request);

    AuthResponse googleLogin(GoogleLoginRequest request);

    AuthResponse refreshToken(RefreshRequest request);

    /** Đổi mật khẩu; trả token mới cho thiết bị hiện tại (token cũ ở mọi nơi bị thu hồi). */
    AuthResponse changePassword(ChangePasswordRequest request);

    /** Bước 1: gửi mã OTP qua mail (phản hồi như nhau dù email có tồn tại hay không). */
    void forgotPassword(ForgotPasswordRequest request);

    /** Bước 2: kiểm tra OTP; đúng thì trả mã phiên dùng một lần (10 phút) để đặt mật khẩu mới. */
    VerifyResetOtpResponse verifyResetOtp(VerifyResetOtpRequest request);

    /** Bước 3: đặt mật khẩu mới bằng mã phiên của bước 2 (không nhận OTP trực tiếp). */
    void resetPassword(ResetPasswordRequest request);
}
