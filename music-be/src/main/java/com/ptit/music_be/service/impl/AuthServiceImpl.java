package com.ptit.music_be.service.impl;

import java.io.IOException;
import java.security.GeneralSecurityException;
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
import com.ptit.music_be.dto.request.*;
import com.ptit.music_be.dto.response.AuthResponse;
import com.ptit.music_be.dto.response.UserResponse;
import com.ptit.music_be.entity.Otp;
import com.ptit.music_be.entity.Role;
import com.ptit.music_be.entity.User;
import com.ptit.music_be.entity.UserRole;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.mapper.UserMapper;
import com.ptit.music_be.repository.OtpRepository;
import com.ptit.music_be.repository.RoleRepository;
import com.ptit.music_be.repository.UserRepository;
import com.ptit.music_be.repository.UserRoleRepository;
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

    UserRepository userRepository;
    RoleRepository roleRepository;
    UserRoleRepository userRoleRepository;
    UserMapper userMapper;
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

    @NonFinal
    @Value("${google.ios-client-id}")
    String googleIosClientId;

    @NonFinal
    @Value("${google.android-client-id}")
    String googleAndroidClientId;

    @Override
    @Transactional
    public UserResponse register(RegisterRequest request) {
        String email = request.getEmail() != null && !request.getEmail().isBlank()
                ? request.getEmail()
                : request.getUsername();

        if (userRepository.existsByEmail(email)) {
            throw new AppException(ErrorCode.USER_EXISTED);
        }

        Role roleUser = roleRepository.findByName("USER")
                .orElseGet(() -> roleRepository.save(Role.builder().name("USER").build()));

        User user = User.builder()
                .email(email)
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .status("ACTIVE")
                .emailVerified(false)
                .authProvider(AuthProvider.LOCAL)
                .build();

        User savedUser = userRepository.save(user);

        UserRole userRole = UserRole.builder()
                .user(savedUser)
                .role(roleUser)
                .build();

        userRoleRepository.save(userRole);
        savedUser.getUserRoles().add(userRole);

        // Send welcome email asynchronously
        if (email != null && !email.isBlank()) {
            emailService.sendWelcomeEmail(SendEmailRequest.builder()
                    .to(email)
                    .fullName(request.getFullName() != null ? request.getFullName() : email)
                    .build());
        }

        return userMapper.toUserResponse(savedUser);
    }

    @Override
    public AuthResponse login(LoginRequest request) {
        User user = userRepository
                .findByEmail(request.getUsername())
                .orElseThrow(() -> new AppException(ErrorCode.INVALID_CREDENTIALS));

        if (user.getPasswordHash() == null
                || !passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new AppException(ErrorCode.INVALID_CREDENTIALS);
        }

        String token = generateToken(user, validDuration);
        String refreshToken = generateToken(user, refreshableDuration);

        return AuthResponse.builder()
                .token(token)
                .refreshToken(refreshToken)
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
            String email = payload.getEmail();
            String name = (String) payload.get("name");

            User user = userRepository.findByEmail(email).orElse(null);

            if (user == null) {
                Role roleUser = roleRepository.findByName("USER")
                        .orElseGet(() -> roleRepository.save(Role.builder().name("USER").build()));

                user = User.builder()
                        .email(email)
                        .status("ACTIVE")
                        .emailVerified(true)
                        .authProvider(AuthProvider.GOOGLE)
                        .build();

                user = userRepository.save(user);

                UserRole userRole = UserRole.builder()
                        .user(user)
                        .role(roleUser)
                        .build();

                userRoleRepository.save(userRole);
                user.getUserRoles().add(userRole);

                if (email != null && !email.isBlank()) {
                    emailService.sendWelcomeEmail(
                            SendEmailRequest.builder().to(email).fullName(name != null ? name : email).build());
                }
            }

            String token = generateToken(user, validDuration);
            String refreshToken = generateToken(user, refreshableDuration);

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

    private String generateToken(User user, long durationHours) {
        JWSHeader header = new JWSHeader(JWSAlgorithm.HS512);

        JWTClaimsSet claimsSet = new JWTClaimsSet.Builder()
                .subject(user.getEmail())
                .issuer("music-app")
                .issueTime(new Date())
                .expirationTime(new Date(
                        Instant.now().plus(durationHours, ChronoUnit.HOURS).toEpochMilli()))
                .jwtID(UUID.randomUUID().toString())
                .claim("scope", buildScope(user))
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
            String email = signedJWT.getJWTClaimsSet().getSubject();

            User user = userRepository
                    .findByEmail(email)
                    .orElseThrow(() -> new AppException(ErrorCode.UNAUTHENTICATED));

            String token = generateToken(user, validDuration);
            String refreshToken = generateToken(user, refreshableDuration);

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

    private String buildScope(User user) {
        if (user.getUserRoles() == null || user.getUserRoles().isEmpty()) {
            return "";
        }

        return user.getUserRoles().stream()
                .filter(ur -> ur.getRole() != null)
                .map(ur -> "ROLE_" + ur.getRole().getName())
                .collect(Collectors.joining(" "));
    }

    @Override
    public void changePassword(ChangePasswordRequest request) {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() -> new AppException(ErrorCode.UNAUTHENTICATED));

        if (AuthProvider.GOOGLE.equals(user.getAuthProvider())) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }

        if (user.getPasswordHash() == null
                || !passwordEncoder.matches(request.getOldPassword(), user.getPasswordHash())) {
            throw new AppException(ErrorCode.INVALID_CREDENTIALS);
        }

        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);
    }

    @Override
    public void forgotPassword(ForgotPasswordRequest request) {
        User user = userRepository
                .findByEmail(request.getEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));

        if (AuthProvider.GOOGLE.equals(user.getAuthProvider())) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }

        String otpCode = String.format("%06d", new Random().nextInt(999999));

        otpRepository.deleteByUser(user); // Xóa các OTP cũ nếu có

        Otp otp = Otp.builder()
                .otpCode(otpCode)
                .expiryTime(LocalDateTime.now().plusMinutes(5))
                .user(user)
                .build();
        otpRepository.save(otp);

        emailService.sendForgotPasswordEmail(user.getEmail(), otpCode);
    }

    @Override
    @Transactional
    public void resetPassword(ResetPasswordRequest request) {
        User user = userRepository
                .findByEmail(request.getEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));

        Otp otp = otpRepository
                .findByUserAndOtpCode(user, request.getOtp())
                .orElseThrow(() -> new AppException(ErrorCode.INVALID_CREDENTIALS));

        if (otp.getExpiryTime().isBefore(LocalDateTime.now())) {
            throw new AppException(ErrorCode.INVALID_CREDENTIALS);
        }

        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);
        otpRepository.delete(otp);
    }
}
