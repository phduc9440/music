package com.ptit.music_be.controller;

import com.ptit.music_be.dto.request.ForgotPasswordRequest;
import com.ptit.music_be.dto.request.LoginRequest;
import com.ptit.music_be.dto.request.RefreshRequest;
import com.ptit.music_be.dto.request.RegisterRequest;
import com.ptit.music_be.dto.request.ResetPasswordRequest;
import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.AuthResponse;
import com.ptit.music_be.dto.response.UserResponse;
import com.ptit.music_be.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Authentication", description = "APIs for user authentication")
public class AuthController {

	AuthService authService;

	@PostMapping("/register")
	@Operation(summary = "Register a new user account")
	public ApiResponse<UserResponse> register(@RequestBody @Valid RegisterRequest request) {
		return ApiResponse.<UserResponse>builder()
				.result(authService.register(request))
				.build();
	}

	@PostMapping("/login")
	@Operation(summary = "Login and receive JWT token")
	public ApiResponse<AuthResponse> login(@RequestBody @Valid LoginRequest request) {
		return ApiResponse.<AuthResponse>builder()
				.result(authService.login(request))
				.build();
	}

	@PostMapping("/refresh")
	@Operation(summary = "Refresh JWT access token")
	public ApiResponse<AuthResponse> refresh(@RequestBody @Valid RefreshRequest request) {
		return ApiResponse.<AuthResponse>builder()
				.result(authService.refreshToken(request))
				.build();
	}

	@PostMapping("/change-password")
	@Operation(summary = "Change password", security = @io.swagger.v3.oas.annotations.security.SecurityRequirement(name = "bearerAuth"))
	public ApiResponse<Void> changePassword(@RequestBody @Valid com.ptit.music_be.dto.request.ChangePasswordRequest request) {
		authService.changePassword(request);
		return ApiResponse.<Void>builder().build();
	}

	@PostMapping("/forgot-password")
	@Operation(summary = "Request OTP for forgotten password")
	public ApiResponse<Void> forgotPassword(@RequestBody @Valid ForgotPasswordRequest request) {
		authService.forgotPassword(request);
		return ApiResponse.<Void>builder().build();
	}

	@PostMapping("/reset-password")
	@Operation(summary = "Reset password using OTP")
	public ApiResponse<Void> resetPassword(@RequestBody @Valid ResetPasswordRequest request) {
		authService.resetPassword(request);
		return ApiResponse.<Void>builder().build();
	}
}
