package com.ptit.music_be.service.score;

import org.springframework.web.multipart.MultipartFile;

import com.ptit.music_be.dto.response.ScoreDetailResponse;

/** Ảnh bìa của bản nhạc: người có quyền sửa tải lên Cloudinary (JPG/PNG, tối đa 3MB), giống ảnh đại diện của thành viên. */
public interface ScoreCoverService {

    /** Tải ảnh bìa mới (ghi đè ảnh cũ). Cần quyền sửa bản nhạc. */
    ScoreDetailResponse upload(String scoreId, MultipartFile file);

    /** Gỡ ảnh bìa, giao diện quay về dùng ảnh trang 1. Cần quyền sửa bản nhạc. */
    ScoreDetailResponse remove(String scoreId);

    /** Xóa ảnh trên Cloudinary khi bản nhạc bị xóa hẳn (lỗi chỉ ghi log, không làm hỏng việc xóa). */
    void deleteQuietly(String scoreId);
}
