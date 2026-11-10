package com.ptit.music_be.service.ai;

import java.nio.file.Path;
import java.util.List;

/** Chạy MuseScore ở chế độ dòng lệnh để chuyển đổi file (đặc tả 5.2). */
public interface MuseScoreCliService {

    /** MuseScore đã được cấu hình và chạy được trên máy này. */
    boolean isAvailable();

    /**
     * Chạy {@code mscore [extraArgs] -o output input}. Chờ tối đa {@code musescore.timeout-seconds}.
     *
     * @param taskId dùng để {@link #kill(String)} khi người dùng hủy; có thể null
     * @throws com.ptit.music_be.exception.MuseScoreException MUSESCORE_TIMEOUT hoặc EXPORT_ERROR
     */
    void convert(Path input, Path output, List<String> extraArgs, String taskId);

    /** Giết tiến trình MuseScore đang chạy cho task (không có thì bỏ qua). */
    void kill(String taskId);
}
