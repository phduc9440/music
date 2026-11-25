package com.ptit.music_be.configuration;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.json.JsonTest;
import org.springframework.context.annotation.Import;

import com.fasterxml.jackson.databind.ObjectMapper;

@JsonTest
@Import(JacksonTimeConfig.class)
class JacksonTimeConfigTest {

    @Autowired
    ObjectMapper mapper;

    @Test
    void localDateTimeIsWrittenAsUtcInstant() throws Exception {
        String json = mapper.writeValueAsString(Map.of("at", LocalDateTime.of(2026, 11, 25, 1, 47)));

        assertThat(json).isEqualTo("{\"at\":\"2026-11-25T01:47:00Z\"}");
    }

    @Test
    void fractionalSecondsAreKept() throws Exception {
        String json = mapper.writeValueAsString(Map.of("at", LocalDateTime.of(2026, 11, 25, 1, 47, 3, 120_000_000)));

        assertThat(json).isEqualTo("{\"at\":\"2026-11-25T01:47:03.120Z\"}");
    }

    @Test
    void localDateStaysADateOnly() throws Exception {
        assertThat(mapper.writeValueAsString(Map.of("day", LocalDate.of(2026, 11, 26))))
                .isEqualTo("{\"day\":\"2026-11-26\"}");
    }

    @Test
    void incomingLocalDateTimeWithOrWithoutZIsStillRead() throws Exception {
        assertThat(mapper.readValue("\"2026-11-25T01:47:00\"", LocalDateTime.class))
                .isEqualTo(LocalDateTime.of(2026, 11, 25, 1, 47));
        assertThat(mapper.readValue("\"2026-11-25T01:47:00Z\"", LocalDateTime.class))
                .isEqualTo(LocalDateTime.of(2026, 11, 25, 1, 47));
    }
}
