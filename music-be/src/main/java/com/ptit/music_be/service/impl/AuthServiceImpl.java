package com.ptit.music_be.service.impl;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.text.ParseException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.MACVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.ptit.music_be.dto.enums.AuthProvider;
import com.ptit.music_be.dto.enums.MemberStatus;
import com.ptit.music_be.dto.request.*;
import com.ptit.music_be.dto.response.AuthResponse;
import com.ptit.music_be.dto.response.MemberResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.MemberRole;
import com.ptit.music_be.entity.Otp;
import com.ptit.music_be.entity.Role;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.mapper.MemberMapper;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.MemberRoleRepository;
import com.ptit.music_be.repository.OtpRepository;
import com.ptit.music_be.repository.RoleRepository;
import com.ptit.music_be.service.AuthService;
import com.ptit.music_be.service.EmailService;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.experimental.NonFinal;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Slf4j
public class AuthServiceImpl implements AuthService {

    MemberRepository memberRepository;
    RoleRepository roleRepository;
    MemberRoleRepository memberRoleRepository;
    MemberMapper memberMapper;
    PasswordEncoder passwordEncoder;
    EmailService emailService;
    OtpRepository otpRepository;

    static final SecureRandom RANDOM = new SecureRandom();
    static final int MAX_OTP_ATTEMPTS = 5;
    static final String TOKEN_TYPE_CLAIM = "typ";
    static final String TYPE_ACCESS = "access";
    static final String TYPE_REFRESH = "refresh";

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

    @NonFinal
    @Value("${google.ios-client-id}")
    String googleIosClientId;

    @NonFinal
    @Value("${google.android-client-id}")
    String googleAndroidClientId;

    @Override
    @Transactional
    public MemberResponse register(RegisterRequest request) {
        String email = (request.getEmail() != null && !request.getEmail().isBlank()
                ? request.getEmail()
                : request.getUsername());
        if (email == null || email.isBlank() || !email.matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")) {
            throw new AppException(ErrorCode.INVALID_CREDENTIALS);
        }
        email = email.trim().toLowerCase();

        if (memberRepository.existsByEmail(email)) {
            throw new AppException(ErrorCode.USER_EXISTED);
        }

        Role roleUser = roleRepository
                .findByName("USER")
                .orElseGet(() -> roleRepository.save(Role.builder().name("USER").build()));

        Member user = Member.builder()
                .email(email)
                .fullName(blankToNull(request.getFullName()))
                .phone(blankToNull(request.getPhone()))
                .address(blankToNull(request.getAddress()))
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .status(MemberStatus.ACTIVE)
                .emailVerified(false)
                .authProvider(AuthProvider.LOCAL)
                .build();

        Member savedUser = memberRepository.save(user);

        MemberRole memberRole =
                MemberRole.builder().member(savedUser).role(roleUser).build();

        memberRoleRepository.save(memberRole);
        savedUser.getMemberRoles().add(memberRole);

        // Send welcome email asynchronously
        if (email != null && !email.isBlank()) {
            emailService.sendWelcomeEmail(SendEmailRequest.builder()
                    .to(email)
                    .fullName(request.getFullName() != null ? request.getFullName() : email)
                    .build());
        }

        return memberMapper.toMemberResponse(savedUser);
    }

    @Override
    public AuthResponse login(LoginRequest request) {
        Member user = memberRepository
                .findByEmail(request.getUsername().trim().toLowerCase())
                .orElseThrow(() -> new AppException(ErrorCode.INVALID_CREDENTIALS));

        if (user.getPasswordHash() == null || !passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new AppException(ErrorCode.INVALID_CREDENTIALS);
        }

        assertActive(user);
        memberRepository.updateLastLogin(user.getId(), LocalDateTime.now());

        return issueTokens(user);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private void assertActive(Member user) {
        if (user.getStatus() != null && user.getStatus() != MemberStatus.ACTIVE) {
            throw new AppException(ErrorCode.ACCOUNT_LOCKED);
        }
    }

    private AuthResponse issueTokens(Member user) {
        return AuthResponse.builder()
                .token(generateToken(user, validDuration, TYPE_ACCESS))
                .refreshToken(generateToken(user, refreshableDuration, TYPE_REFRESH))
                .authenticated(true)
                .build();
    }

    @Override
    @Transactional
    public AuthResponse googleLogin(GoogleLoginRequest request) {
        try {
            GoogleIdTokenVerifier verifier = new GoogleIdTokenVerifier.Builder(
                            new NetHttpTransport(), new GsonFactory())
                    .setAudience(Arrays.asList(googleClientId, googleIosClientId, googleAndroidClientId))
                    .build();

            GoogleIdToken idTokenObj = verifier.verify(request.getIdToken());
            if (idTokenObj == null) {
                throw new AppException(ErrorCode.UNAUTHENTICATED);
            }

            GoogleIdToken.Payload payload = idTokenObj.getPayload();
            if (!Boolean.TRUE.equals(payload.getEmailVerified())) {
                throw new AppException(ErrorCode.UNAUTHENTICATED);
            }
            String email = payload.getEmail();
            String name = (String) payload.get("name");

            Member user = memberRepository.findByEmail(email).orElse(null);

            if (user == null) {
                Role roleUser = roleRepository
                        .findByName("USER")
                        .orElseGet(() ->
                                roleRepository.save(Role.builder().name("USER").build()));

                user = Member.builder()
                        .email(email)
                        .fullName(blankToNull(name))
                        .status(MemberStatus.ACTIVE)
                        .emailVerified(true)
                        .authProvider(AuthProvider.GOOGLE)
                        .build();

                user = memberRepository.save(user);

                MemberRole memberRole =
                        MemberRole.builder().member(user).role(roleUser).build();

                memberRoleRepository.save(memberRole);
                user.getMemberRoles().add(memberRole);

                if (email != null && !email.isBlank()) {
                    emailService.sendWelcomeEmail(SendEmailRequest.builder()
                            .to(email)
                            .fullName(name != null ? name : email)
                            .build());
                }
            }

            assertActive(user);
            memberRepository.updateLastLogin(user.getId(), LocalDateTime.now());

            return issueTokens(user);

        } catch (GeneralSecurityException | IOException e) {
            log.error("Google token verification failed", e);
            throw new AppException(ErrorCode.UNAUTHENTICATED);
        }
    }

    private String generateToken(Member user, long durationHours, String type) {
        JWSHeader header = new JWSHeader(JWSAlgorithm.HS512);

        JWTClaimsSet claimsSet = new JWTClaimsSet.Builder()
                .subject(user.getEmail())
                .issuer("music-app")
                .issueTime(new Date())
                .expirationTime(new Date(
                        Instant.now().plus(durationHours, ChronoUnit.HOURS).toEpochMilli()))
                .jwtID(UUID.randomUUID().toString())
                .claim("scope", buildScope(user))
                .claim(TOKEN_TYPE_CLAIM, type)
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
            if (!TYPE_REFRESH.equals(signedJWT.getJWTClaimsSet().getStringClaim(TOKEN_TYPE_CLAIM))) {
                throw new AppException(ErrorCode.UNAUTHENTICATED);
            }
            String email = signedJWT.getJWTClaimsSet().getSubject();

            Member user =
                    memberRepository.findByEmail(email).orElseThrow(() -> new AppException(ErrorCode.UNAUTHENTICATED));

            assertActive(user);

            return issueTokens(user);
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

    private String buildScope(Member user) {
        if (user.getMemberRoles() == null || user.getMemberRoles().isEmpty()) {
            return "";
        }

        // SUPER_ADMIN kéo theo ADMIN để mọi chỗ kiểm tra hasRole('ADMIN') (kể cả /api/admin/**) vẫn qua
        return user.getMemberRoles().stream()
                .filter(ur -> ur.getRole() != null)
                .flatMap(ur -> "SUPER_ADMIN".equals(ur.getRole().getName())
                        ? java.util.stream.Stream.of("ROLE_SUPER_ADMIN", "ROLE_ADMIN")
                        : java.util.stream.Stream.of("ROLE_" + ur.getRole().getName()))
                .distinct()
                .collect(Collectors.joining(" "));
    }

    @Override
    public void changePassword(ChangePasswordRequest request) {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();

        Member user =
                memberRepository.findByEmail(email).orElseThrow(() -> new AppException(ErrorCode.UNAUTHENTICATED));

        if (AuthProvider.GOOGLE.equals(user.getAuthProvider())) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }

        if (user.getPasswordHash() == null
                || !passwordEncoder.matches(request.getOldPassword(), user.getPasswordHash())) {
            throw new AppException(ErrorCode.INVALID_CREDENTIALS);
        }

        if (request.getOldPassword().equals(request.getNewPassword())) {
            throw new AppException(ErrorCode.PASSWORD_SAME_AS_OLD);
        }

        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        memberRepository.save(user);
    }

    @Override
    public void forgotPassword(ForgotPasswordRequest request) {
        // Always respond the same way to avoid leaking which emails are registered.
        Member user = memberRepository
                .findByEmail(request.getEmail().trim().toLowerCase())
                .orElse(null);
        if (user == null || AuthProvider.GOOGLE.equals(user.getAuthProvider())) {
            return;
        }

        String otpCode = String.format("%06d", RANDOM.nextInt(1_000_000));

        otpRepository.deleteByMember(user); // Xóa các OTP cũ nếu có

        Otp otp = Otp.builder()
                .otpCode(otpCode)
                .expiryTime(LocalDateTime.now().plusMinutes(5))
                .member(user)
                .build();
        otpRepository.save(otp);

        emailService.sendForgotPasswordEmail(user.getEmail(), otpCode);
    }

    @Override
    @Transactional(noRollbackFor = AppException.class)
    public void resetPassword(ResetPasswordRequest request) {
        Member user = memberRepository
                .findByEmail(request.getEmail().trim().toLowerCase())
                .orElseThrow(() -> new AppException(ErrorCode.INVALID_CREDENTIALS));

        Otp otp = otpRepository.findByMember(user).orElseThrow(() -> new AppException(ErrorCode.INVALID_CREDENTIALS));

        int attempts = otp.getAttempts() == null ? 0 : otp.getAttempts();
        if (otp.getExpiryTime().isBefore(LocalDateTime.now()) || attempts >= MAX_OTP_ATTEMPTS) {
            otpRepository.delete(otp);
            throw new AppException(ErrorCode.INVALID_CREDENTIALS);
        }

        if (!MessageDigest.isEqual(
                otp.getOtpCode().getBytes(StandardCharsets.UTF_8),
                request.getOtp().getBytes(StandardCharsets.UTF_8))) {
            otp.setAttempts(attempts + 1);
            otpRepository.save(otp);
            throw new AppException(ErrorCode.INVALID_CREDENTIALS);
        }

        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        memberRepository.save(user);
        otpRepository.delete(otp);
    }
}
