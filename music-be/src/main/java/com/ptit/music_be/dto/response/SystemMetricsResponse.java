package com.ptit.music_be.dto.response;

import java.time.Instant;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Thông số tải máy chủ lúc gọi API. Giá trị Double/Long null nghĩa là hệ điều hành không cung cấp. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class SystemMetricsResponse {
    Instant timestamp;
    Instant startTime;
    long uptimeSeconds;

    long heapUsedBytes;
    /** Heap tối đa; JVM không đặt giới hạn thì lấy heap đã cấp phát. */
    long heapMaxBytes;

    /** Tải CPU của tiến trình backend, 0-100 (%). */
    Double processCpuPercent;
    /** Tải CPU của cả máy, 0-100 (%). */
    Double systemCpuPercent;
    /** Load average 1 phút (không có trên Windows). */
    Double loadAverage;

    int availableProcessors;

    Long physicalMemoryTotalBytes;
    Long physicalMemoryFreeBytes;

    int threadCount;
    int peakThreadCount;

    /** Ổ đĩa chứa thư mục lưu file (app.storage.local-root). */
    Long diskTotalBytes;

    Long diskUsableBytes;

    String javaVersion;
    /** Số lỗi ERROR từ lúc backend khởi động. */
    long errorCountSinceStart;
}
