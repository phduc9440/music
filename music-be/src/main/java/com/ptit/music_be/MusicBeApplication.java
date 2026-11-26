package com.ptit.music_be;

import java.util.TimeZone;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class MusicBeApplication {

    public static void main(String[] args) {
        // Mọi LocalDateTime.now() và cột thời gian là giờ UTC, dù chạy trong Docker hay trên máy dev (X-06).
        // Hiển thị đổi sang giờ người dùng ở web; "hôm nay", gom theo ngày, lịch chạy dùng giờ Việt Nam (AppTime).
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
        SpringApplication.run(MusicBeApplication.class, args);
    }
}
