package com.ptit.music_be.client;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/** Kết quả {@code POST /convert/normalize} của music-ai: metadata rút từ MusicXML đã chuẩn hóa. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record MusicXmlNormalizeResult(
        int measureCount,
        int staffCount,
        String keySignature,
        String timeSignature,
        int tempoBpm,
        List<String> warnings) {

    public List<String> warnings() {
        return warnings == null ? List.of() : warnings;
    }
}
