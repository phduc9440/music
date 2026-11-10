package com.ptit.music_be.service.admin.impl;

import java.io.File;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryUsage;
import java.time.Instant;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.ptit.music_be.dto.response.ErrorLogResponse;
import com.ptit.music_be.dto.response.SystemMetricsResponse;
import com.ptit.music_be.monitoring.ErrorLogStore;
import com.ptit.music_be.service.admin.AdminSystemService;

@Service
public class AdminSystemServiceImpl implements AdminSystemService {

    static final int DEFAULT_LIMIT = 50;
    static final int MAX_LIMIT = 200;

    private final ErrorLogStore errorLogStore;
    private final File storageRoot;

    public AdminSystemServiceImpl(
            ErrorLogStore errorLogStore, @Value("${app.storage.local-root:./storage}") String storageRoot) {
        this.errorLogStore = errorLogStore;
        this.storageRoot = new File(storageRoot).getAbsoluteFile();
    }

    @Override
    public SystemMetricsResponse getMetrics() {
        var runtime = ManagementFactory.getRuntimeMXBean();
        MemoryUsage heap = ManagementFactory.getMemoryMXBean().getHeapMemoryUsage();
        var threads = ManagementFactory.getThreadMXBean();
        var os = ManagementFactory.getOperatingSystemMXBean();

        Double processCpu = null;
        Double systemCpu = null;
        Long memTotal = null;
        Long memFree = null;
        if (os instanceof com.sun.management.OperatingSystemMXBean sun) {
            processCpu = percent(sun.getProcessCpuLoad());
            systemCpu = percent(sun.getCpuLoad());
            memTotal = sun.getTotalMemorySize();
            memFree = sun.getFreeMemorySize();
        }
        double load = os.getSystemLoadAverage();

        // Thư mục lưu file có thể chưa tồn tại thì đo ổ đĩa của thư mục cha gần nhất
        File disk = storageRoot;
        while (disk != null && !disk.exists()) {
            disk = disk.getParentFile();
        }

        return SystemMetricsResponse.builder()
                .timestamp(Instant.now())
                .startTime(Instant.ofEpochMilli(runtime.getStartTime()))
                .uptimeSeconds(runtime.getUptime() / 1000)
                .heapUsedBytes(heap.getUsed())
                .heapMaxBytes(heap.getMax() > 0 ? heap.getMax() : heap.getCommitted())
                .processCpuPercent(processCpu)
                .systemCpuPercent(systemCpu)
                .loadAverage(load < 0 ? null : Math.round(load * 100) / 100.0)
                .availableProcessors(os.getAvailableProcessors())
                .physicalMemoryTotalBytes(memTotal)
                .physicalMemoryFreeBytes(memFree)
                .threadCount(threads.getThreadCount())
                .peakThreadCount(threads.getPeakThreadCount())
                .diskTotalBytes(disk == null ? null : disk.getTotalSpace())
                .diskUsableBytes(disk == null ? null : disk.getUsableSpace())
                .javaVersion(System.getProperty("java.version"))
                .errorCountSinceStart(errorLogStore.totalSinceStart())
                .build();
    }

    @Override
    public List<ErrorLogResponse> getErrorLogs(Integer limit) {
        int n = limit == null ? DEFAULT_LIMIT : Math.min(Math.max(limit, 1), MAX_LIMIT);
        return errorLogStore.latest(n);
    }

    @Override
    public void clearErrorLogs() {
        errorLogStore.clear();
    }

    /** CPU load của JVM là 0..1 và âm khi chưa đo được (lần gọi đầu). */
    private static Double percent(double load) {
        return load < 0 ? null : Math.round(load * 1000) / 10.0;
    }
}
