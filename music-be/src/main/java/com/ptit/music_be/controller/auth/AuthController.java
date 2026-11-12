package com.ptit.music_be.controller.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ptit.music_be.configuration.AuthCookies;
import com.ptit.music_be.dto.request.ForgotPasswordRequest;
import com.ptit.music_be.dto.request.GoogleLoginRequest;
import com.ptit.music_be.dto.request.LoginRequest;
import com.ptit.music_be.dto.request.RefreshRequest;
import com.ptit.music_be.dto.request.RegisterRequest;
import com.ptit.music_be.dto.request.ResetPasswordRequest;
import com.ptit.music_be.dto.request.VerifyResetOtpRequest;
import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.VerifyResetOtpResponse;
import com.ptit.music_be.dto.response.AuthResponse;
import com.ptit.music_be.dto.response.MemberResponse;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.service.auth.AuthService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Authentication", description = "APIs for user authentication")
public class AuthController {

    AuthService authService;
    AuthCookies authCookies;

    @PostMapping("/register")
    @Operation(summary = "Register a new user account")
    public ApiResponse<MemberResponse> register(@RequestBody @Valid RegisterRequest request) {
        return ApiResponse.<MemberResponse>builder()
                .result(authService.register(request))
                .build();
    }

    @PostMapping("/login")
    @Operation(summary = "Login and receive JWT token")
    public ApiResponse<AuthResponse> login(@RequestBody @Valid LoginRequest request, HttpServletResponse response) {
        AuthResponse auth = authService.login(request);
        authCookies.write(response, auth);
        return ApiResponse.<AuthResponse>builder().result(auth).build();
    }

    @PostMapping("/google-login")
    @Operation(summary = "Login using Google ID Token")
    public ApiResponse<AuthResponse> googleLogin(
            @RequestBody @Valid GoogleLoginRequest request, HttpServletResponse response) {
        AuthResponse auth = authService.googleLogin(request);
        authCookies.write(response, auth);
        return ApiResponse.<AuthResponse>builder().result(auth).build();
    }

    @PostMapping("/refresh")
    @Operation(summary = "Refresh JWT access token")
    public ApiResponse<AuthResponse> refresh(
            @RequestBody(required = false) RefreshRequest body,
            HttpServletRequest httpRequest,
            HttpServletResponse response) {
        String token = body != null
                        && body.getRefreshToken() != null
                        && !body.getRefreshToken().isBlank()
                ? body.getRefreshToken()
                : AuthCookies.read(httpRequest, AuthCookies.REFRESH);
        if (token == null) throw new AppException(ErrorCode.UNAUTHENTICATED);

        AuthResponse auth = authService.refreshToken(
                RefreshRequest.builder().refreshToken(token).build());
        authCookies.write(response, auth);
        return ApiResponse.<AuthResponse>builder().result(auth).build();
    }

    @PostMapping("/logout")
    @Operation(summary = "Clear auth cookies")
    public ApiResponse<Void> logout(HttpServletResponse response) {
        authCookies.clear(response);
        return ApiResponse.<Void>builder().build();
    }

    @PostMapping("/change-password")
    @Operation(
            summary = "Change password (logs out other devices; this device gets new cookies)",
            security = @io.swagger.v3.oas.annotations.security.SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> changePassword(
            @RequestBody @Valid com.ptit.music_be.dto.request.ChangePasswordRequest request,
            HttpServletResponse response) {
        // Thiết bị hiện tại nhận cookie token mới; các thiết bị khác bị đăng xuất vì token cũ bị thu hồi
        authCookies.write(response, authService.changePassword(request));
        return ApiResponse.<Void>builder().build();
    }

    @PostMapping("/forgot-password")
    @Operation(summary = "Request OTP for forgotten password")
    public ApiResponse<Void> forgotPassword(@RequestBody @Valid ForgotPasswordRequest request) {
        authService.forgotPassword(request);
        return ApiResponse.<Void>builder().build();
    }

    @PostMapping("/verify-reset-otp")
    @Operation(
            summary = "Step 2 of forgot password: check the OTP and get a one-time reset token (valid 10 minutes)",
            description = "Errors: 1017 wrong/expired OTP (5 wrong tries cancel the code)")
    public ApiResponse<VerifyResetOtpResponse> verifyResetOtp(
            @RequestBody @Valid VerifyResetOtpRequest request) {
        return ApiResponse.<VerifyResetOtpResponse>builder()
                .result(authService.verifyResetOtp(request))
                .build();
    }

    @PostMapping("/reset-password")
    @Operation(
            summary = "Step 3 of forgot password: set the new password with the reset token from verify-reset-otp",
            description = "Errors: 1019 reset session expired or invalid (request a new OTP), 1007 password too short")
    public ApiResponse<Void> resetPassword(@RequestBody @Valid ResetPasswordRequest request) {
        authService.resetPassword(request);
        return ApiResponse.<Void>builder().build();
    }
}
