package com.ptit.music_be.configuration;

import java.util.ArrayList;
import java.util.List;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;

import com.ptit.music_be.entity.Role;
import com.ptit.music_be.utils.SecurityUtils;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityScheme;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class SecurityConfig {

    static final String[] PUBLIC_ENDPOINTS = {
        "/api/auth/**", "/swagger-ui/**", "/swagger-ui.html", "/v3/api-docs/**", "/swagger-resources/**", "/webjars/**",
    };

    /** Bắt tay WebSocket: không qua bộ lọc JWT của API mà tự xác thực trong WebSocketAuthHandshake. */
    static final String WEBSOCKET_ENDPOINT = "/ws/**";

    /** IPN do cổng thanh toán gọi (không có JWT); mỗi thông báo bắt buộc đúng chữ ký, kiểm trong PaymentProvider. */
    static final String PAYMENT_IPN_ENDPOINT = "/api/payments/*/ipn";

    static final String[] PUBLIC_READ_ENDPOINTS = {"/api/public/**"};

    CustomJwtDecoder customJwtDecoder;
    final MemberStatusGuard memberStatusGuard;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {

        http.authorizeHttpRequests(request -> request.requestMatchers(PUBLIC_ENDPOINTS)
                .permitAll()
                .requestMatchers(WEBSOCKET_ENDPOINT)
                .permitAll()
                .requestMatchers(HttpMethod.GET, PAYMENT_IPN_ENDPOINT)
                .permitAll()
                // API đọc cho khách chưa đăng nhập (trang chủ...), chỉ trả dữ liệu của bản PUBLIC
                .requestMatchers(HttpMethod.GET, PUBLIC_READ_ENDPOINTS)
                .permitAll()
                // Khu quản trị: có ít nhất một quyền quản trị (theo vai trò); từng API kiểm tra quyền riêng bằng @perm
                .requestMatchers("/api/admin/**")
                .access((authentication, context) ->
                        new AuthorizationDecision(SecurityUtils.hasAdminAccess(authentication.get())))
                .anyRequest()
                .authenticated());

        http.oauth2ResourceServer(oauth2 -> oauth2.jwt(jwtConfigurer -> jwtConfigurer
                        .decoder(customJwtDecoder)
                        .jwtAuthenticationConverter(jwtAuthenticationConverter()))
                .bearerTokenResolver(new CookieBearerTokenResolver())
                .authenticationEntryPoint(new JwtAuthenticationEntryPoint())
                .accessDeniedHandler(new JwtAccessDeniedHandler()));

        http.csrf(AbstractHttpConfigurer::disable);
        http.cors(Customizer.withDefaults());

        return http.build();
    }

    /**
     * Quyền của request lấy theo vai trò hiện tại trong DB (MemberStatusGuard nhớ 15 giây), không theo claim scope ghi lúc
     * cấp token: cấp / thu hồi vai trò có hiệu lực ngay mà không cần đăng nhập lại. SUPER_ADMIN kèm ROLE_ADMIN như trước.
     */
    @Bean
    JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtAuthenticationConverter jwtAuthenticationConverter = new JwtAuthenticationConverter();
        jwtAuthenticationConverter.setJwtGrantedAuthoritiesConverter(jwt -> {
            List<GrantedAuthority> authorities = new ArrayList<>();
            for (String role : memberStatusGuard.roleNames(jwt.getSubject())) {
                authorities.add(new SimpleGrantedAuthority("ROLE_" + role));
                if (Role.SUPER_ADMIN.equals(role)) {
                    authorities.add(new SimpleGrantedAuthority("ROLE_" + Role.ADMIN));
                }
            }
            return authorities;
        });
        return jwtAuthenticationConverter;
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(10);
    }

    @Bean
    public OpenAPI openAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("Music API")
                        .description("REST API for Music Application")
                        .version("1.0.0"))
                .components(new Components()
                        .addSecuritySchemes(
                                "bearerAuth",
                                new SecurityScheme()
                                        .type(SecurityScheme.Type.HTTP)
                                        .scheme("bearer")
                                        .bearerFormat("JWT")));
    }
}
