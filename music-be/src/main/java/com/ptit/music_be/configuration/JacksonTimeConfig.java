package com.ptit.music_be.configuration;

import java.io.IOException;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.Module;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.fasterxml.jackson.databind.module.SimpleModule;
import com.fasterxml.jackson.databind.ser.std.StdSerializer;

/**
 * Trả {@link LocalDateTime} kèm múi giờ (X-06). DB và JVM đều là UTC, nhưng chuỗi {@code 2026-11-25T01:47:00} không ghi
 * múi giờ nên trình duyệt hiểu là giờ máy và hiện lệch 7 tiếng ở Việt Nam. Ghi thành {@code 2026-11-25T01:47:00Z} thì
 * {@code new Date(...)} ở web tự đổi sang giờ của người xem. Chỉ ảnh hưởng chiều gửi đi; nhận vào vẫn đọc như cũ.
 */
@Configuration
public class JacksonTimeConfig {

    @Bean
    public Module utcLocalDateTimeModule() {
        SimpleModule module = new SimpleModule("utcLocalDateTime");
        module.addSerializer(LocalDateTime.class, new UtcLocalDateTimeSerializer());
        return module;
    }

    static class UtcLocalDateTimeSerializer extends StdSerializer<LocalDateTime> {

        UtcLocalDateTimeSerializer() {
            super(LocalDateTime.class);
        }

        @Override
        public void serialize(LocalDateTime value, JsonGenerator gen, SerializerProvider provider) throws IOException {
            gen.writeString(DateTimeFormatter.ISO_INSTANT.format(value.toInstant(ZoneOffset.UTC)));
        }
    }
}
