package com.ptit.music_be.service.composer;

import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;

import org.springframework.stereotype.Component;

import com.ptit.music_be.entity.Score;

import lombok.RequiredArgsConstructor;

/**
 * Mỗi lần lưu bản nhạc (tạo bằng OMR, nhập file, sao chép, sửa thông tin...), gắn lại {@code composer_id} theo chữ tác
 * giả, để mọi luồng tạo/sửa bản nhạc không phải tự nhớ việc này. Spring tiêm bean vào listener của JPA.
 */
@Component
@RequiredArgsConstructor
public class ScoreComposerListener {

    private final ComposerMatcher composerMatcher;

    @PrePersist
    @PreUpdate
    void linkComposer(Score score) {
        score.setComposerId(composerMatcher.match(score.getComposer()));
    }
}
