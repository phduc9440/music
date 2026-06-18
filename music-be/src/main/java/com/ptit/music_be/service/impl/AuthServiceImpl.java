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
import com.ptit.music_be.dto.response.AuthResponse;
import com.ptit.music_be.dto.response.UserResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.User;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.mapper.MemberMapper;
import com.ptit.music_be.repository.MemberRepository;
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
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.UUID;

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

	@NonFinal
	@Value("${jwt.signerKey}")
	String signerKey;

	@NonFinal
	@Value("${jwt.valid-duration}")
	long validDuration;

	@NonFinal
	@Value("${jwt.refreshable-duration}")
	long refreshableDuration;

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
				.role("USER")
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
		if (member.getRole() == null || member.getRole().isBlank()) {
			return "";
		}

		return "ROLE_" + member.getRole().toUpperCase();
	}
}

