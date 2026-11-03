package com.ptit.music_be.service;

import java.util.List;

import org.springframework.web.multipart.MultipartFile;

import com.ptit.music_be.dto.response.OmrUploadResponse;

public interface OmrService {

    /**
     * Accepts exactly one PDF, or 1..N images (PNG/JPG/JPEG, in page order). Creates a Score, stores the
     * originals and queues an OMR_CONVERSION task.
     */
    OmrUploadResponse upload(List<MultipartFile> files, String title);
}
