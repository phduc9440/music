package com.ptit.music_be.dto.response;

/**
 * Dữ liệu kèm lỗi SCORE_VERSION_CONFLICT (2014) để web hiện trong modal xung đột.
 *
 * @param currentVersion version MusicXML mới nhất đang lưu trên server
 */
public record ScoreVersionConflict(int currentVersion) {}
