package com.ptit.music_be.configuration;

import jakarta.annotation.PostConstruct;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

/**
 * Cấu hình giao tiếp Java <-> music-ai (đặc tả mục 6). {@code application.yaml} được giữ local (skip-worktree) nên
 * mọi giá trị có mặc định ngay trong code; ghi đè bằng biến môi trường hoặc thuộc tính cùng tên.
 */
@Component
@Getter
@Slf4j
public class AiServiceProperties {

    /** Tên header chứa khóa bí mật dùng chung giữa Java và music-ai (cả hai chiều). */
    public static final String INTERNAL_KEY_HEADER = "X-Internal-Key";

    static final String DEFAULT_INTERNAL_KEY = "dev-internal-key";

    /** Địa chỉ music-ai. Biến môi trường: AI_BASE_URL. */
    private final String baseUrl;

    /** Khóa bí mật dùng chung. Biến môi trường: AI_INTERNAL_KEY. Phải đổi khi triển khai thật. */
    private final String internalKey;

    private final int connectTimeoutMs;
    private final int readTimeoutMs;

    /** Timeout đọc của các lệnh chuyển đổi đồng bộ (kern/MusicXML/MIDI, đặc tả mục 6.2), tính bằng mili giây. */
    private final int convertTimeoutMs;

    /**
     * Bước cuối cùng pipeline OMR được chạy: PREPROCESS, MERGE (nhận diện + ghép kern) hoặc EXPORT (đủ MusicXML/MIDI,
     * mặc định). Hai giá trị đầu chỉ dùng để chạy thử từng phần pipeline. Biến môi trường: OMR_STOP_AFTER.
     */
    private final String stopAfter;

    /** Task PENDING chưa gửi được quá bấy nhiêu giây thì job quét sẽ gửi lại. */
    private final int pendingResendSeconds;

    /** Số lần gửi lại tối đa (không tính lần gửi đầu) trước khi báo AI_SERVICE_UNAVAILABLE. */
    private final int maxResends;

    /** Task PROCESSING không có callback quá bấy nhiêu phút thì báo TASK_TIMEOUT. */
    private final int processingTimeoutMinutes;

    /** Task đã được music-ai nhận nhưng chưa chạy, quá bấy nhiêu phút không có tin gì thì báo TASK_TIMEOUT. */
    private final int queuedTimeoutMinutes;

    public AiServiceProperties(
            @Value("${app.ai.base-url:${AI_BASE_URL:http://localhost:8000}}") String baseUrl,
            @Value("${app.ai.internal-key:${AI_INTERNAL_KEY:" + DEFAULT_INTERNAL_KEY + "}}") String internalKey,
            @Value("${app.ai.connect-timeout-ms:5000}") int connectTimeoutMs,
            @Value("${app.ai.read-timeout-ms:15000}") int readTimeoutMs,
            @Value("${app.ai.convert-timeout-ms:20000}") int convertTimeoutMs,
            @Value("${omr.stop-after:${OMR_STOP_AFTER:EXPORT}}") String stopAfter,
            @Value("${app.ai.pending-resend-seconds:30}") int pendingResendSeconds,
            @Value("${app.ai.max-resends:2}") int maxResends,
            @Value("${app.ai.processing-timeout-minutes:10}") int processingTimeoutMinutes,
            @Value("${app.ai.queued-timeout-minutes:30}") int queuedTimeoutMinutes) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.internalKey = internalKey;
        this.connectTimeoutMs = connectTimeoutMs;
        this.readTimeoutMs = readTimeoutMs;
        this.convertTimeoutMs = convertTimeoutMs;
        this.stopAfter = stopAfter.trim().toUpperCase();
        this.pendingResendSeconds = pendingResendSeconds;
        this.maxResends = maxResends;
        this.processingTimeoutMinutes = processingTimeoutMinutes;
        this.queuedTimeoutMinutes = queuedTimeoutMinutes;
    }

    @PostConstruct
    void warnIfDefaultKey() {
        if (DEFAULT_INTERNAL_KEY.equals(internalKey)) {
            log.warn("Đang dùng X-Internal-Key mặc định cho music-ai. Hãy đặt biến môi trường AI_INTERNAL_KEY.");
        }
    }
}
