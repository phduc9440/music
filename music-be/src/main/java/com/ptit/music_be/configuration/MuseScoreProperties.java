package com.ptit.music_be.configuration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import lombok.Getter;

/**
 * Cấu hình xuất file bằng MuseScore (đặc tả 5.2). Mọi giá trị có mặc định ngay trong code; ghi đè bằng biến môi trường
 * ({@code MUSESCORE_PATH}, {@code MUSESCORE_TIMEOUT}, {@code MUSESCORE_MAX_CONCURRENT}) hoặc thuộc tính cùng tên.
 */
@Component
@Getter
public class MuseScoreProperties {

    /** Đường dẫn tới chương trình MuseScore 3.6.2 (rỗng = chưa cấu hình, xuất file trả lỗi 2704). */
    private final String path;

    /** Một lần chạy MuseScore quá bấy nhiêu giây thì bị giết và báo MUSESCORE_TIMEOUT. */
    private final int timeoutSeconds;

    /** Số tiến trình MuseScore chạy cùng lúc tối đa. */
    private final int maxConcurrent;

    /** Bản nhạc ước lượng dài hơn bấy nhiêu giây thì không cho xuất âm thanh (lỗi 2702). */
    private final int maxAudioSeconds;

    /** Lịch (cron Spring) của job dọn file xuất cũ. */
    private final String cleanupCron;

    public MuseScoreProperties(
            @Value("${musescore.path:${MUSESCORE_PATH:}}") String path,
            @Value("${musescore.timeout-seconds:${MUSESCORE_TIMEOUT:120}}") int timeoutSeconds,
            @Value("${musescore.max-concurrent:${MUSESCORE_MAX_CONCURRENT:2}}") int maxConcurrent,
            @Value("${export.max-audio-seconds:1200}") int maxAudioSeconds,
            @Value("${export.cleanup-cron:0 0 3 * * *}") String cleanupCron) {
        this.path = path == null ? "" : path.trim();
        this.timeoutSeconds = Math.max(1, timeoutSeconds);
        this.maxConcurrent = Math.max(1, maxConcurrent);
        this.maxAudioSeconds = maxAudioSeconds;
        this.cleanupCron = cleanupCron;
    }
}
