package com.ptit.music_be.service.impl;

import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.MACVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.ptit.music_be.dto.request.LoginRequest;
import com.ptit.music_be.dto.request.RefreshRequest;
import com.ptit.music_be.dto.request.RegisterRequest;
import com.ptit.music_be.dto.request.SendEmailRequest;
import com.ptit.music_be.dto.request.ChangePasswordRequest;
import org.springframework.security.core.context.SecurityContextHolder;
import com.ptit.music_be.dto.request.ForgotPasswordRequest;
import com.ptit.music_be.dto.request.ResetPasswordRequest;
import com.ptit.music_be.dto.request.GoogleLoginRequest;
import com.ptit.music_be.dto.response.AuthResponse;
import com.ptit.music_be.dto.response.UserResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Otp;
import com.ptit.music_be.entity.User;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.dto.enums.*;
import com.ptit.music_be.mapper.MemberMapper;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.OtpRepository;
import com.ptit.music_be.repository.UserRepository;
import com.ptit.music_be.service.AuthService;
import com.ptit.music_be.service.EmailService;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.experimental.NonFinal;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.text.ParseException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.Random;
import java.util.UUID;
import java.util.Collections;
import java.io.IOException;
import java.security.GeneralSecurityException;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Slf4j
public class AuthServiceImpl implements AuthService {

	UserRepository userRepository;
	MemberRepository memberRepository;
	MemberMapper memberMapper;
	PasswordEncoder passwordEncoder;
	EmailService emailService;
	OtpRepository otpRepository;

	@NonFinal
	@Value("${jwt.signerKey}")
	String signerKey;

	@NonFinal
	@Value("${jwt.valid-duration}")
	long validDuration;

	@NonFinal
	@Value("${jwt.refreshable-duration}")
	long refreshableDuration;

	@NonFinal
	@Value("${google.client-id}")
	String googleClientId;

	@Override
	public UserResponse register(RegisterRequest request) {
		if (memberRepository.existsByUsername(request.getUsername())) {
			throw new AppException(ErrorCode.USER_EXISTED);
		}

		User user = User.builder()
				.username(request.getUsername())
				.password(passwordEncoder.encode(request.getPassword()))
				.email(request.getEmail())
				.phone(request.getPhone())
				.fullName(request.getFullName())
				.address(request.getAddress())
				.role(Role.USER)
				.authProvider(AuthProvider.LOCAL)
				.build();

		User savedUser = userRepository.save(user);

		// Send welcome email asynchronously
		if (request.getEmail() != null && !request.getEmail().isBlank()) {
			emailService.sendWelcomeEmail(SendEmailRequest.builder()
					.to(request.getEmail())
					.fullName(request.getFullName())
					.build());
		}

		return memberMapper.toUserResponse(savedUser);
	}

	@Override
	public AuthResponse login(LoginRequest request) {
		Member member = memberRepository
				.findByUsername(request.getUsername())
				.orElseThrow(() -> new AppException(ErrorCode.INVALID_CREDENTIALS));

		if (!passwordEncoder.matches(request.getPassword(), member.getPassword())) {
			throw new AppException(ErrorCode.INVALID_CREDENTIALS);
		}

		String token = generateToken(member, validDuration);
		String refreshToken = generateToken(member, refreshableDuration);

		return AuthResponse.builder()
				.token(token)
				.refreshToken(refreshToken)
				.authenticated(true)
				.build();
	}

	@Override
	public AuthResponse googleLogin(GoogleLoginRequest request) {
		try {
			GoogleIdTokenVerifier verifier = new GoogleIdTokenVerifier.Builder(new NetHttpTransport(), new GsonFactory())
					.setAudience(Collections.singletonList(googleClientId))
					.build();

			GoogleIdToken idTokenObj = verifier.verify(request.getIdToken());
			if (idTokenObj == null) {
				throw new AppException(ErrorCode.UNAUTHENTICATED);
			}

			GoogleIdToken.Payload payload = idTokenObj.getPayload();
			String email = payload.getEmail();
			String name = (String) payload.get("name");

			Member member = memberRepository.findByEmail(email).orElse(null);

			if (member == null) {
				User user = User.builder()
						.email(email)
						.fullName(name)
						.role(Role.USER)
						.authProvider(AuthProvider.GOOGLE)
						.build();
				member = userRepository.save(user);

				if (email != null && !email.isBlank()) {
					emailService.sendWelcomeEmail(SendEmailRequest.builder()
							.to(email)
							.fullName(name)
							.build());
				}
			}

			String token = generateToken(member, validDuration);
			String refreshToken = generateToken(member, refreshableDuration);

			return AuthResponse.builder()
					.token(token)
					.refreshToken(refreshToken)
					.authenticated(true)
					.build();

		} catch (GeneralSecurityException | IOException e) {
			log.error("Google token verification failed", e);
			throw new AppException(ErrorCode.UNAUTHENTICATED);
		}
	}

	private String generateToken(Member member, long durationHours) {
		JWSHeader header = new JWSHeader(JWSAlgorithm.HS512);

		JWTClaimsSet claimsSet = new JWTClaimsSet.Builder()
				.subject(member.getUsername())
				.issuer("music-app")
				.issueTime(new Date())
				.expirationTime(new Date(Instant.now().plus(durationHours, ChronoUnit.HOURS).toEpochMilli()))
				.jwtID(UUID.randomUUID().toString())
				.claim("scope", buildScope(member))
				.build();

		SignedJWT signedJWT = new SignedJWT(header, claimsSet);

		try {
			JWSSigner signer = new MACSigner(signerKey.getBytes());
			signedJWT.sign(signer);
		} catch (JOSEException e) {
			log.error("Cannot create token", e);
			throw new RuntimeException(e);
		}

		return signedJWT.serialize();
	}

	@Override
	public AuthResponse refreshToken(RefreshRequest request) {
		try {
			SignedJWT signedJWT = verifyToken(request.getRefreshToken());
			String username = signedJWT.getJWTClaimsSet().getSubject();

			Member member = memberRepository.findByUsername(username)
					.orElseThrow(() -> new AppException(ErrorCode.UNAUTHENTICATED));

			String token = generateToken(member, validDuration);
			String refreshToken = generateToken(member, refreshableDuration);

			return AuthResponse.builder()
					.token(token)
					.refreshToken(refreshToken)
					.authenticated(true)
					.build();
		} catch (ParseException | JOSEException | AppException e) {
			log.error("Token refresh failed", e);
			throw new AppException(ErrorCode.UNAUTHENTICATED);
		}
	}

	private SignedJWT verifyToken(String token) throws ParseException, JOSEException {
		JWSVerifier verifier = new MACVerifier(signerKey.getBytes());
		SignedJWT signedJWT = SignedJWT.parse(token);

		boolean verified = signedJWT.verify(verifier);
		Date expiryTime = signedJWT.getJWTClaimsSet().getExpirationTime();

		if (!(verified && expiryTime.after(new Date()))) {
			throw new AppException(ErrorCode.UNAUTHENTICATED);
		}

		return signedJWT;
	}

	private String buildScope(Member member) {
		if (member.getRole() == null) {
			return "";
		}

		return "ROLE_" + member.getRole().name();
	}

	@Override
	public void changePassword(ChangePasswordRequest request) {
		String username = SecurityContextHolder.getContext().getAuthentication().getName();

		Member member = memberRepository.findByUsername(username)
				.orElseThrow(() -> new AppException(ErrorCode.UNAUTHENTICATED));

		if (AuthProvider.GOOGLE.equals(member.getAuthProvider())) {
			throw new AppException(ErrorCode.UNAUTHORIZED); // or a custom error code
		}

		if (!passwordEncoder.matches(request.getOldPassword(), member.getPassword())) {
			throw new AppException(ErrorCode.INVALID_CREDENTIALS);
		}

		member.setPassword(passwordEncoder.encode(request.getNewPassword()));
		memberRepository.save(member);
	}

	@Override
	public void forgotPassword(ForgotPasswordRequest request) {
		Member member = memberRepository.findByEmail(request.getEmail())
				.orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));

		if (AuthProvider.GOOGLE.equals(member.getAuthProvider())) {
			throw new AppException(ErrorCode.UNAUTHORIZED);
		}

		String otpCode = String.format("%06d", new Random().nextInt(999999));
		
		otpRepository.deleteByMember(member); // Xóa các OTP cũ nếu có

		Otp otp = Otp.builder()
				.otpCode(otpCode)
				.expiryTime(LocalDateTime.now().plusMinutes(5))
				.member(member)
				.build();
		otpRepository.save(otp);

		emailService.sendForgotPasswordEmail(member.getEmail(), otpCode);
	}

	@Override
	public void resetPassword(ResetPasswordRequest request) {
		Member member = memberRepository.findByEmail(request.getEmail())
				.orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));

		Otp otp = otpRepository.findByMemberAndOtpCode(member, request.getOtp())
				.orElseThrow(() -> new AppException(ErrorCode.INVALID_CREDENTIALS)); // Hoặc lỗi OTP không hợp lệ

		if (otp.getExpiryTime().isBefore(LocalDateTime.now())) {
			throw new AppException(ErrorCode.INVALID_CREDENTIALS); // OTP hết hạn
		}

		member.setPassword(passwordEncoder.encode(request.getNewPassword()));
		memberRepository.save(member);
		otpRepository.delete(otp);
	}
}

