package com.ptit.music_be.event;

/**
 * Bản nhạc vừa được import xong (đã commit). {@code midi = true} khi file gốc là MIDI và cần tự chuyển sang MusicXML.
 */
public record ScoreImportedEvent(String scoreId, String memberId, boolean midi) {}
