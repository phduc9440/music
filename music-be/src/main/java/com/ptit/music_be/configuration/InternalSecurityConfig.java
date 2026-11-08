package com.ptit.music_be.configuration;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Chuỗi bảo mật riêng cho {@code /internal/**} (callback từ music-ai, đặc tả mục 6.1). Được xếp trước chuỗi JWT
 * trong {@link SecurityConfig} nên không phải sửa file đó; các đường dẫn khác vẫn đi theo chuỗi cũ.
 */
@Configuration
public class InternalSecurityConfig {

    @Bean
    @Order(1)
    SecurityFilterChain internalFilterChain(
            HttpSecurity http, AiServiceProperties properties, ObjectMapper objectMapper) throws Exception {
        http.securityMatcher("/internal/**")
                .authorizeHttpRequests(request -> request.anyRequest().authenticated())
                .addFilterBefore(new InternalApiKeyFilter(properties, objectMapper), AuthorizationFilter.class)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .csrf(AbstractHttpConfigurer::disable);
        return http.build();
    }
}
