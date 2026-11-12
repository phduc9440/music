package com.ptit.music_be.service.score.impl;

import java.io.IOException;
import java.io.InputStream;
import java.util.Map;
import java.util.Set;

import javax.imageio.ImageIO;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import com.ptit.music_be.dto.response.ScoreDetailResponse;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.score.ScoreCoverService;
import com.ptit.music_be.service.score.ScoreFileService;
import com.ptit.music_be.service.score.ScoreService;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class ScoreCoverServiceImpl implements ScoreCoverService {

    static final long MAX_COVER_BYTES = 3L * 1024 * 1024;
    static final Set<String> ALLOWED_TYPES = Set.of("image/jpeg", "image/png");

    ScoreRepository scoreRepository;
    ScoreFileService scoreFileService;
    ScoreService scoreService;
    Cloudinary cloudinary;

    @Override
    @Transactional
    public ScoreDetailResponse upload(String scoreId, MultipartFile file) {
        Score score = find(scoreId);
        scoreFileService.checkCanEdit(score);
        validate(file);
        String url;
        try {
            // Public id cố định theo bản nhạc + overwrite: tải lại thì thay ảnh cũ, không để rác trên Cloudinary
            Map<?, ?> result = cloudinary
                    .uploader()
                    .upload(
                            file.getBytes(),
                            ObjectUtils.asMap(
                                    "public_id", publicId(score.getId()),
                                    "overwrite", true,
                                    "invalidate", true,
                                    "resource_type", "image"));
            url = (String) result.get("secure_url");
        } catch (Exception e) {
            log.warn("Không tải được ảnh bìa bản nhạc {}: {}", scoreId, e.getMessage());
            throw new AppException(ErrorCode.FILE_STORAGE_ERROR);
        }
        // Thêm tham số phiên bản để trình duyệt tải lại ảnh sau khi ghi đè
        score.setCoverUrl(url + "?v=" + System.currentTimeMillis());
        scoreRepository.save(score);
        return scoreService.getScore(scoreId);
    }

    @Override
    @Transactional
    public ScoreDetailResponse remove(String scoreId) {
        Score score = find(scoreId);
        scoreFileService.checkCanEdit(score);
        if (score.getCoverUrl() != null) {
            try {
                cloudinary.uploader().destroy(publicId(score.getId()), ObjectUtils.asMap("invalidate", true));
            } catch (Exception e) {
                throw new AppException(ErrorCode.FILE_STORAGE_ERROR);
            }
            score.setCoverUrl(null);
            scoreRepository.save(score);
        }
        return scoreService.getScore(scoreId);
    }

    @Override
    public void deleteQuietly(String scoreId) {
        try {
            cloudinary.uploader().destroy(publicId(scoreId), ObjectUtils.asMap("invalidate", true));
        } catch (Exception e) {
            log.warn("Không xóa được ảnh bìa của bản nhạc {} trên Cloudinary: {}", scoreId, e.getMessage());
        }
    }

    private Score find(String scoreId) {
        return scoreRepository
                .findById(scoreId == null ? "" : scoreId)
                .orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
    }

    /** Kiểm tra kích thước, loại và thật sự giải mã được thành ảnh (không tin Content-Type do client gửi). */
    private static void validate(MultipartFile file) {
        if (file == null || file.isEmpty() || file.getSize() > MAX_COVER_BYTES) {
            throw new AppException(ErrorCode.SCORE_COVER_INVALID);
        }
        String type = file.getContentType();
        if (type == null || !ALLOWED_TYPES.contains(type)) {
            throw new AppException(ErrorCode.SCORE_COVER_INVALID);
        }
        try (InputStream in = file.getInputStream()) {
            if (ImageIO.read(in) == null) {
                throw new AppException(ErrorCode.SCORE_COVER_INVALID);
            }
        } catch (IOException e) {
            throw new AppException(ErrorCode.SCORE_COVER_INVALID);
        }
    }

    private static String publicId(String scoreId) {
        return "score-covers/" + scoreId;
    }
}
