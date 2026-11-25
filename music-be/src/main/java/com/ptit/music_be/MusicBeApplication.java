package com.ptit.music_be;

import java.util.TimeZone;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class MusicBeApplication {

    public static void main(String[] args) {
        // Mọi thời điểm lưu DB và trả về API là UTC, bất kể máy chủ đặt múi giờ nào (máy dev ở Việt Nam, container UTC):
        // LocalDateTime.now() ở khắp nơi dùng múi giờ mặc định của JVM nên phải cố định trước khi Spring khởi động (X-06)
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
        SpringApplication.run(MusicBeApplication.class, args);
    }
}
