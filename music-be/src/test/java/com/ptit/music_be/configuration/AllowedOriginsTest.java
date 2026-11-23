package com.ptit.music_be.configuration;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.web.cors.CorsConfiguration;

/** Origin được phép gọi API và mở WebSocket: cấu hình được, mặc định cho máy dev, luôn gồm địa chỉ web của app. */
class AllowedOriginsTest {

    @Test
    void defaultsCoverLocalDevServers() {
        AllowedOrigins origins = new AllowedOrigins(AllowedOrigins.DEFAULT, "");

        assertThat(origins.list()).containsExactly("http://localhost:5173", "http://localhost:3000");
    }

    @Test
    void customListIsTrimmedAndTrailingSlashRemoved() {
        AllowedOrigins origins = new AllowedOrigins(" https://music.example.com/ , ,https://admin.example.com", "");

        assertThat(origins.list()).containsExactly("https://music.example.com", "https://admin.example.com");
    }

    @Test
    void appWebUrlIsAlwaysAllowedWithoutDuplicates() {
        AllowedOrigins deployed = new AllowedOrigins(AllowedOrigins.DEFAULT, "https://music.example.com/");
        AllowedOrigins local = new AllowedOrigins(AllowedOrigins.DEFAULT, "http://localhost:5173");

        assertThat(deployed.list()).contains("https://music.example.com");
        assertThat(local.list()).containsExactly("http://localhost:5173", "http://localhost:3000");
    }

    @Test
    void corsAcceptsConfiguredOriginAndRejectsOthers() {
        CorsConfiguration cors =
                CorsConfig.corsConfiguration(new AllowedOrigins(AllowedOrigins.DEFAULT, "https://music.example.com"));

        assertThat(cors.checkOrigin("https://music.example.com")).isEqualTo("https://music.example.com");
        assertThat(cors.checkOrigin("https://evil.example.com")).isNull();
        assertThat(cors.getAllowCredentials()).isTrue();
        assertThat(cors.getExposedHeaders()).contains("ETag");
    }
}
