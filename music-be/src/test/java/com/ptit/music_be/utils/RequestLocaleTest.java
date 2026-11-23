package com.ptit.music_be.utils;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import com.ptit.music_be.dto.enums.auth.AppLocale;

class RequestLocaleTest {

    @Test
    void englishHeadersMapToEn() {
        assertThat(RequestLocale.parse("en")).isEqualTo(AppLocale.EN);
        assertThat(RequestLocale.parse("en-US,en;q=0.9,vi;q=0.8")).isEqualTo(AppLocale.EN);
        assertThat(RequestLocale.parse(" EN-gb ")).isEqualTo(AppLocale.EN);
    }

    @Test
    void everythingElseFallsBackToVi() {
        assertThat(RequestLocale.parse(null)).isEqualTo(AppLocale.VI);
        assertThat(RequestLocale.parse("")).isEqualTo(AppLocale.VI);
        assertThat(RequestLocale.parse("vi")).isEqualTo(AppLocale.VI);
        assertThat(RequestLocale.parse("vi-VN,vi;q=0.9,en;q=0.8")).isEqualTo(AppLocale.VI);
        assertThat(RequestLocale.parse("fr-FR")).isEqualTo(AppLocale.VI);
        // "english" không phải mã en; chỉ xét ngôn ngữ đứng đầu
        assertThat(RequestLocale.parse("enx")).isEqualTo(AppLocale.VI);
    }

    @Test
    void withoutARequestItIsVi() {
        assertThat(RequestLocale.resolve()).isEqualTo(AppLocale.VI);
    }
}
