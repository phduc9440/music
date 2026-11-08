package com.ptit.music_be.service;

import org.springframework.web.multipart.MultipartFile;

import com.ptit.music_be.dto.response.ScoreImportResponse;

public interface ScoreImportService {

    /**
     * Nhập trực tiếp 1 file MusicXML (.musicxml, .xml, .mxl) hoặc MIDI (.mid, .midi), không qua OMR. Score tạo ra có
     * sourceType = IMPORT và processingStatus = COMPLETED.
     *
     * @param title tiêu đề, rỗng thì lấy từ file (work-title) hoặc tên file
     * @param composer tác giả (tùy chọn); rỗng thì lấy từ MusicXML
     */
    ScoreImportResponse importScore(MultipartFile file, String title, String composer);
}
