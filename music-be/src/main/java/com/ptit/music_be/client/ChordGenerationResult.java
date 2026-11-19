package com.ptit.music_be.client;

/**
 * Kết quả {@code POST /chords/generate} của music-ai: giọng đoán được ("C major"), số bước, số hợp âm đã ghi, số ô bỏ qua
 * và số ô đã có hợp âm sẵn (giữ nguyên).
 */
public record ChordGenerationResult(String outPath, String key, int steps, int filled, int skipped, int keptExisting) {}
