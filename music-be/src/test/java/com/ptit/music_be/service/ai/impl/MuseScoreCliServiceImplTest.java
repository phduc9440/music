package com.ptit.music_be.service.ai.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.concurrent.CompletableFuture;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.ptit.music_be.configuration.MuseScoreProperties;
import com.ptit.music_be.dto.enums.ai.AiTaskError;
import com.ptit.music_be.exception.MuseScoreException;

class MuseScoreCliServiceImplTest {

    @TempDir
    Path dir;

    Path script;

    @BeforeEach
    void setUp() throws Exception {
        script = dir.resolve("fake-mscore.sh");
        try (InputStream in = getClass().getResourceAsStream("/fake-mscore.sh")) {
            Files.copy(in, script, StandardCopyOption.REPLACE_EXISTING);
        }
        assertTrue(script.toFile().setExecutable(true));
    }

    private MuseScoreCliServiceImpl service(String path, int timeoutSeconds, int maxConcurrent) {
        return new MuseScoreCliServiceImpl(
                new MuseScoreProperties(path, timeoutSeconds, maxConcurrent, 1200, "0 0 3 * * *"));
    }

    private Path input(String content) throws Exception {
        Path in = Files.createTempFile(dir, "in", ".musicxml");
        Files.writeString(in, content);
        return in;
    }

    @Test
    void convert_success_writesOutput() throws Exception {
        Path out = dir.resolve("out/result.mp3");
        service(script.toString(), 10, 2).convert(input("ok"), out, List.of("-b", "192"), "t1");
        assertTrue(Files.size(out) > 0);
    }

    @Test
    void convert_timeout_throwsMuseScoreTimeout() throws Exception {
        MuseScoreException e = assertThrows(MuseScoreException.class, () -> service(script.toString(), 1, 2)
                .convert(input("hang"), dir.resolve("a.mp3"), List.of(), "t2"));
        assertEquals(AiTaskError.MUSESCORE_TIMEOUT, e.getError());
    }

    @Test
    void convert_nonZeroExit_throwsExportError() throws Exception {
        MuseScoreException e = assertThrows(MuseScoreException.class, () -> service(script.toString(), 10, 2)
                .convert(input("fail"), dir.resolve("a.mp3"), List.of(), "t3"));
        assertEquals(AiTaskError.EXPORT_ERROR, e.getError());
    }

    @Test
    void convert_emptyOutput_throwsExportError() throws Exception {
        MuseScoreException e = assertThrows(MuseScoreException.class, () -> service(script.toString(), 10, 2)
                .convert(input("empty"), dir.resolve("a.mp3"), List.of(), null));
        assertEquals(AiTaskError.EXPORT_ERROR, e.getError());
    }

    @Test
    void convert_multiPageSvg_acceptsNumberedFiles() throws Exception {
        Path out = dir.resolve("out.svg");
        service(script.toString(), 10, 2).convert(input("svg"), out, List.of(), null);
        assertTrue(Files.exists(dir.resolve("out-1.svg")));
        assertTrue(Files.exists(dir.resolve("out-2.svg")));
    }

    @Test
    void convert_limitsConcurrentProcesses() throws Exception {
        MuseScoreCliServiceImpl svc = service(script.toString(), 10, 1);
        Path in1 = input("slow");
        Path in2 = input("slow");
        long start = System.nanoTime();
        CompletableFuture<Void> a =
                CompletableFuture.runAsync(() -> svc.convert(in1, dir.resolve("1.mp3"), List.of(), null));
        CompletableFuture<Void> b =
                CompletableFuture.runAsync(() -> svc.convert(in2, dir.resolve("2.mp3"), List.of(), null));
        CompletableFuture.allOf(a, b).get();
        long elapsedMs = (System.nanoTime() - start) / 1_000_000;
        // Mỗi lần chạy mất ~1 giây; chỉ cho một tiến trình cùng lúc thì hai lần phải nối đuôi nhau.
        assertTrue(elapsedMs >= 1900, "elapsed=" + elapsedMs);
    }

    @Test
    void kill_stopsRunningProcess() throws Exception {
        MuseScoreCliServiceImpl svc = service(script.toString(), 10, 2);
        Path in = input("hang");
        CompletableFuture<Void> f =
                CompletableFuture.runAsync(() -> svc.convert(in, dir.resolve("k.mp3"), List.of(), "tk"));
        Thread.sleep(500);
        long start = System.nanoTime();
        svc.kill("tk");
        ExecutionExceptionHolder.expectMuseScoreError(f);
        assertTrue((System.nanoTime() - start) / 1_000_000 < 3000);
    }

    @Test
    void isAvailable_reflectsConfiguration() {
        assertTrue(service(script.toString(), 10, 2).isAvailable());
        assertFalse(service("", 10, 2).isAvailable());
        assertFalse(service(dir.resolve("missing").toString(), 10, 2).isAvailable());
    }

    /** Gói lỗi của CompletableFuture để test kiểm tra MuseScoreException bên trong. */
    static final class ExecutionExceptionHolder {
        static void expectMuseScoreError(CompletableFuture<Void> f) {
            Exception e = assertThrows(java.util.concurrent.ExecutionException.class, f::get);
            assertTrue(e.getCause() instanceof MuseScoreException);
            assertEquals(AiTaskError.EXPORT_ERROR, ((MuseScoreException) e.getCause()).getError());
        }
    }
}
