package com.ptit.music_be.configuration;

import java.io.IOException;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.fasterxml.jackson.databind.ser.std.StdSerializer;

/**
 * Trả mọi LocalDateTime ra JSON kèm múi giờ UTC ("2026-11-25T15:54:11Z") (X-06).
 *
 * <p>Các cột thời gian lưu giờ UTC (JVM chạy UTC) nhưng LocalDateTime không mang múi giờ, nên trước đây web đọc
 * "2026-11-25T15:54:11" như giờ máy người dùng và hiện lệch 7 tiếng. Có chữ Z thì trình duyệt tự đổi sang giờ địa phương.
 * Áp dụng cho REST và tin nhắn WebSocket (Spring Boot dùng chung ObjectMapper). LocalDate (ngày hạn, ngày sinh...) giữ
 * nguyên. Chiều đọc vào: chuỗi có Z đã được Jackson đổi về UTC sẵn.
 */
@Configuration
public class JacksonTimeConfig {

    @Bean
    Jackson2ObjectMapperBuilderCustomizer utcLocalDateTime() {
        return builder -> builder.serializerByType(LocalDateTime.class, new UtcLocalDateTimeSerializer());
    }

    static final class UtcLocalDateTimeSerializer extends StdSerializer<LocalDateTime> {

        private static final DateTimeFormatter FORMAT = DateTimeFormatter.ISO_OFFSET_DATE_TIME;

        UtcLocalDateTimeSerializer() {
            super(LocalDateTime.class);
        }

        @Override
        public void serialize(LocalDateTime value, JsonGenerator gen, SerializerProvider provider) throws IOException {
            gen.writeString(FORMAT.format(value.atOffset(ZoneOffset.UTC)));
        }
    }
}
