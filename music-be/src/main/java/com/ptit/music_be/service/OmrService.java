package com.ptit.music_be.service;

import java.util.List;

import org.springframework.web.multipart.MultipartFile;

import com.ptit.music_be.dto.response.OmrUploadResponse;

public interface OmrService {

    /**
     * Nhận đúng 1 PDF (1-20 trang) hoặc 1-20 ảnh PNG/JPG/JPEG theo thứ tự trang. Tạo Score, lưu file gốc và xếp
     * hàng một tác vụ OMR_CONVERSION.
     *
     * @param title tiêu đề, rỗng thì lấy theo tên file đầu tiên
     * @param composer tác giả (tùy chọn, tối đa 255 ký tự)
     * @param sourceType PHOTO / SCAN / PDF_NATIVE; rỗng thì tự đoán (PDF -> PDF_NATIVE, ảnh -> PHOTO)
     */
    OmrUploadResponse upload(List<MultipartFile> files, String title, String composer, String sourceType);
}
