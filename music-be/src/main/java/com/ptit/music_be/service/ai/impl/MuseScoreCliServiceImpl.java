package com.ptit.music_be.service.ai.impl;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

import org.springframework.stereotype.Service;

import com.ptit.music_be.configuration.MuseScoreProperties;
import com.ptit.music_be.dto.enums.ai.AiTaskError;
import com.ptit.music_be.exception.MuseScoreException;
import com.ptit.music_be.service.ai.MuseScoreCliService;

import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class MuseScoreCliServiceImpl implements MuseScoreCliService {

    /** Số dòng cuối của đầu ra MuseScore giữ lại để ghi log khi lỗi. */
    private static final int LOG_TAIL_LINES = 200;

    private final MuseScoreProperties properties;
    private final Semaphore slots;
    private final Map<String, Process> running = new ConcurrentHashMap<>();

    public MuseScoreCliServiceImpl(MuseScoreProperties properties) {
        this.properties = properties;
        this.slots = new Semaphore(properties.getMaxConcurrent(), true);
    }

    @Override
    public boolean isAvailable() {
        String path = properties.getPath();
        if (path.isEmpty()) {
            return false;
        }
        Path p = Path.of(path);
        return Files.isRegularFile(p) && Files.isExecutable(p);
    }

    @Override
    public void convert(Path input, Path output, List<String> extraArgs, String taskId) {
        if (!isAvailable()) {
            throw new MuseScoreException(AiTaskError.EXPORT_ERROR, "MuseScore chưa được cấu hình");
        }
        try {
            Files.createDirectories(output.toAbsolutePath().getParent());
        } catch (IOException e) {
            throw new MuseScoreException(AiTaskError.EXPORT_ERROR, "không tạo được thư mục đầu ra");
        }

        try {
            slots.acquire();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new MuseScoreException(AiTaskError.EXPORT_ERROR, "bị ngắt khi chờ MuseScore");
        }
        try {
            run(input, output, extraArgs == null ? List.of() : extraArgs, taskId);
        } finally {
            slots.release();
        }
        verifyOutput(output);
    }

    @Override
    public void kill(String taskId) {
        if (taskId == null) {
            return;
        }
        Process process = running.get(taskId);
        if (process != null) {
            log.info("Hủy tiến trình MuseScore của task {}", taskId);
            process.destroyForcibly();
        }
    }

    private void run(Path input, Path output, List<String> extraArgs, String taskId) {
        List<String> command = new ArrayList<>();
        command.add(properties.getPath());
        command.addAll(extraArgs);
        command.add("-o");
        command.add(output.toAbsolutePath().toString());
        command.add(input.toAbsolutePath().toString());

        ProcessBuilder builder = new ProcessBuilder(command).redirectErrorStream(true);
        if (System.getProperty("os.name", "").toLowerCase().contains("linux")) {
            builder.environment().put("QT_QPA_PLATFORM", "offscreen");
        }

        Process process;
        try {
            process = builder.start();
        } catch (IOException e) {
            throw new MuseScoreException(AiTaskError.EXPORT_ERROR, "không chạy được MuseScore: " + e.getMessage());
        }
        if (taskId != null) {
            running.put(taskId, process);
        }

        Deque<String> tail = new ArrayDeque<>();
        Thread reader = new Thread(() -> drain(process, tail), "mscore-output");
        reader.setDaemon(true);
        reader.start();

        try {
            boolean finished = process.waitFor(properties.getTimeoutSeconds(), TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                throw new MuseScoreException(
                        AiTaskError.MUSESCORE_TIMEOUT, "quá " + properties.getTimeoutSeconds() + " giây");
            }
            reader.join(1000);
            int exit = process.exitValue();
            if (exit != 0) {
                log.warn("MuseScore thoát mã {} (task {}): {}", exit, taskId, tailText(tail));
                throw new MuseScoreException(AiTaskError.EXPORT_ERROR, "MuseScore thoát với mã " + exit);
            }
        } catch (InterruptedException e) {
            process.destroyForcibly();
            Thread.currentThread().interrupt();
            throw new MuseScoreException(AiTaskError.EXPORT_ERROR, "bị ngắt khi chờ MuseScore");
        } finally {
            if (taskId != null) {
                running.remove(taskId, process);
            }
        }
    }

    private static void drain(Process process, Deque<String> tail) {
        try (BufferedReader reader =
                new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                synchronized (tail) {
                    if (tail.size() >= LOG_TAIL_LINES) {
                        tail.removeFirst();
                    }
                    tail.addLast(line);
                }
            }
        } catch (IOException ignored) {
            // Tiến trình bị giết thì luồng đọc đóng, không cần xử lý.
        }
    }

    private static String tailText(Deque<String> tail) {
        synchronized (tail) {
            return String.join("\n", tail);
        }
    }

    /** File ra phải tồn tại và khác 0 byte. SVG nhiều trang được MuseScore tách thành {@code tên-1.svg}, {@code tên-2.svg}. */
    private static void verifyOutput(Path output) {
        try {
            if (Files.isRegularFile(output) && Files.size(output) > 0) {
                return;
            }
            String name = output.getFileName().toString();
            if (name.toLowerCase().endsWith(".svg")) {
                String base = name.substring(0, name.length() - 4);
                try (Stream<Path> siblings = Files.list(output.toAbsolutePath().getParent())) {
                    boolean found = siblings.anyMatch(p -> {
                        String n = p.getFileName().toString();
                        return n.startsWith(base + "-") && n.toLowerCase().endsWith(".svg") && isNonEmpty(p);
                    });
                    if (found) {
                        return;
                    }
                }
            }
        } catch (IOException e) {
            throw new MuseScoreException(AiTaskError.EXPORT_ERROR, "không đọc được file kết quả");
        }
        throw new MuseScoreException(AiTaskError.EXPORT_ERROR, "MuseScore không tạo ra file kết quả");
    }

    private static boolean isNonEmpty(Path p) {
        try {
            return Files.size(p) > 0;
        } catch (IOException e) {
            return false;
        }
    }
}
