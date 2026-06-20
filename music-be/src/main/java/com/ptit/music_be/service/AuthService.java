package com.ptit.music_be.service;

import com.ptit.music_be.dto.request.ChangePasswordRequest;
import com.ptit.music_be.dto.request.LoginRequest;
import com.ptit.music_be.dto.request.RefreshRequest;
import com.ptit.music_be.dto.request.RegisterRequest;
import com.ptit.music_be.dto.response.AuthResponse;
import com.ptit.music_be.dto.response.UserResponse;

public interface AuthService {

	UserResponse register(RegisterRequest request);

	AuthResponse login(LoginRequest request);

	AuthResponse refreshToken(RefreshRequest request);

	void changePassword(ChangePasswordRequest request);
}
