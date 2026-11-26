package com.ptit.music_be.client;

import java.util.List;

/**
 * Kết quả {@code POST /chords/generate} của music-ai: giọng đoán được ("C major"), số bước, số hợp âm đã ghi và số ô bỏ qua
 * của phương án A, số ô đã có hợp âm sẵn, hạt giống lấy mẫu và các phương án (A ghi ở {@code outPath}, B, C ở
 * {@code <outPath>-2/-3.musicxml}), xếp theo điểm của model giảm dần.
 */
public record ChordGenerationResult(
        String outPath,
        String key,
        int steps,
        int filled,
        int skipped,
        int keptExisting,
        Long seed,
        List<Option> options) {

    /** Một phương án: file, số hợp âm ghi được, điểm (log xác suất trung bình của model). */
    public record Option(String outPath, int filled, double score) {}

    /** Danh sách phương án, không bao giờ null (music-ai cũ không trả thì chỉ có phương án A ở outPath). */
    public List<Option> optionsOrDefault() {
        return options == null || options.isEmpty() ? List.of(new Option(outPath, filled, 0)) : options;
    }
}
