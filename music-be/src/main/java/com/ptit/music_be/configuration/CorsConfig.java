package com.ptit.music_be.configuration;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

@Configuration
public class CorsConfig {

    @Bean
    public CorsFilter corsFilter(AllowedOrigins allowedOrigins) {
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", corsConfiguration(allowedOrigins));
        return new CorsFilter(source);
    }

    /** Cấu hình CORS: origin theo {@link AllowedOrigins} (không viết cứng), mọi header và method, cho gửi cookie. */
    static CorsConfiguration corsConfiguration(AllowedOrigins allowedOrigins) {
        CorsConfiguration corsConfiguration = new CorsConfiguration();
        allowedOrigins.list().forEach(corsConfiguration::addAllowedOrigin);
        corsConfiguration.addAllowedHeader("*");
        corsConfiguration.addAllowedMethod("*");
        // Cho JS đọc header ETag (Editor lấy version MusicXML từ ETag của GET /scores/{id}/musicxml)
        corsConfiguration.addExposedHeader("ETag");
        // Cho gửi cookie (access token HttpOnly)
        corsConfiguration.setAllowCredentials(true);
        return corsConfiguration;
    }
}
