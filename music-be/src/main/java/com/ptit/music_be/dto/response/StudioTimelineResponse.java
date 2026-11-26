package com.ptit.music_be.dto.response;

import java.util.List;

public record StudioTimelineResponse(
        String scoreId,
        String contentHash,
        String title,
        int measureCount,
        int tempoBpm,
        List<TimeSignature> timeSignatures,
        List<TempoChange> tempoChanges,
        List<Measure> measures,
        List<Note> notes,
        List<Step> steps,
        List<String> warnings) {

    public record TimeSignature(int measure, int beats, int beatType) {}

    public record TempoChange(int measure, int bpm) {}

    /**
     * Một lượt phát của ô nhịp: {@code index} là thứ tự phát (từ 1, sau khi mở dấu nhắc lại), {@code source} là số ô trên
     * bản nhạc (ST-08). {@code source} null ở timeline cũ trong cache.
     */
    public record Measure(int index, double startBeat, double beats, Integer source) {}

    public record Note(
            String id,
            int measure,
            int staff,
            String hand,
            int midi,
            double startBeat,
            double durationBeat,
            boolean scorable,
            String chordGroupId,
            OsmdPosition osmd) {}

    public record OsmdPosition(int measureIndex, int voice, int entryIndex) {}

    public record Step(int stepIndex, double startBeat, List<String> noteIds) {}
}
