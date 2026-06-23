package com.ptit.music_be.service;

import com.ptit.music_be.dto.request.ChangePasswordRequest;
import com.ptit.music_be.dto.request.ForgotPasswordRequest;
import com.ptit.music_be.dto.request.GoogleLoginRequest;
import com.ptit.music_be.dto.request.LoginRequest;
import com.ptit.music_be.dto.request.RefreshRequest;
import com.ptit.music_be.dto.request.RegisterRequest;
import com.ptit.music_be.dto.request.ResetPasswordRequest;
import com.ptit.music_be.dto.response.AuthResponse;
import com.ptit.music_be.dto.response.UserResponse;

public interface AuthService {

	UserResponse register(RegisterRequest request);

	AuthResponse login(LoginRequest request);

	AuthResponse googleLogin(GoogleLoginRequest request);

	AuthResponse refreshToken(RefreshRequest request);

	void changePassword(ChangePasswordRequest request);

	void forgotPassword(ForgotPasswordRequest request);

	void resetPassword(ResetPasswordRequest request);
}
