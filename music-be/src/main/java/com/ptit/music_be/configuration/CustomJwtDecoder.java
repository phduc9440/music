package com.ptit.music_be.configuration;

import java.util.Objects;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Component;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Component
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class CustomJwtDecoder implements JwtDecoder {
    @Value("${jwt.signerKey}")
    private String SIGNER_KEY;

    final MemberStatusGuard memberStatusGuard;

    NimbusJwtDecoder nimbusJwtDecoder;

    @Override
    public Jwt decode(String token) throws JwtException {

        if (Objects.isNull(nimbusJwtDecoder)) {
            SecretKeySpec secretKeySpec = new SecretKeySpec(SIGNER_KEY.getBytes(), "HS512");
            nimbusJwtDecoder = NimbusJwtDecoder.withSecretKey(secretKeySpec)
                    .macAlgorithm(MacAlgorithm.HS512)
                    .build();
        }

        Jwt jwt = nimbusJwtDecoder.decode(token);
        // Refresh tokens must only be accepted by /auth/refresh, never as API bearer tokens.
        if ("refresh".equals(jwt.getClaimAsString("typ"))) {
            throw new JwtException("Refresh token cannot be used as access token");
        }
        // Tài khoản bị admin khóa thì token đã cấp cũng không dùng được nữa (FE sẽ thử refresh rồi bị từ chối)
        if (memberStatusGuard.isLocked(jwt.getSubject())) {
            throw new JwtException("Account is locked");
        }
        return jwt;
    }
}
