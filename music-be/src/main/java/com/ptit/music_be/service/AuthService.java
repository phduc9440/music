package com.ptit.music_be.service;

import com.ptit.music_be.dto.request.ChangePasswordRequest;
import com.ptit.music_be.dto.request.ForgotPasswordRequest;
import com.ptit.music_be.dto.request.GoogleLoginRequest;
import com.ptit.music_be.dto.request.LoginRequest;
import com.ptit.music_be.dto.request.RefreshRequest;
import com.ptit.music_be.dto.request.RegisterRequest;
import com.ptit.music_be.dto.request.ResetPasswordRequest;
import com.ptit.music_be.dto.response.AuthResponse;
import com.ptit.music_be.dto.response.MemberResponse;

public interface AuthService {

    MemberResponse register(RegisterRequest request);

    AuthResponse login(LoginRequest request);

    AuthResponse googleLogin(GoogleLoginRequest request);

    AuthResponse refreshToken(RefreshRequest request);

    /** Đổi mật khẩu; trả token mới cho thiết bị hiện tại (token cũ ở mọi nơi bị thu hồi). */
    AuthResponse changePassword(ChangePasswordRequest request);

    void forgotPassword(ForgotPasswordRequest request);

    void resetPassword(ResetPasswordRequest request);
}
