package com.ptit.music_be.service.composer;

import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;

import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import com.ptit.music_be.entity.Score;
import com.ptit.music_be.repository.composer.ComposerRepository;

/**
 * Mỗi lần lưu bản nhạc (tạo bằng OMR, nhập file, sao chép, sửa thông tin...), chữ tác giả gõ tay khớp một nhạc sĩ trong
 * danh mục thì gắn {@code composer_id} và bỏ chữ gõ tay (3NF: tên nằm ở {@code composers.name}). Không khớp thì giữ chữ.
 * Bản đã gắn mà không đổi tác giả thì giữ nguyên. Spring tiêm bean vào listener của JPA.
 */
@Component
public class ScoreComposerListener {

    private final ComposerMatcher composerMatcher;
    private final ComposerRepository composerRepository;

    public ScoreComposerListener(ComposerMatcher composerMatcher, @Lazy ComposerRepository composerRepository) {
        this.composerMatcher = composerMatcher;
        this.composerRepository = composerRepository;
    }

    @PrePersist
    @PreUpdate
    void linkComposer(Score score) {
        String text = score.getComposerText();
        if (!StringUtils.hasText(text)) {
            return;
        }
        String id = composerMatcher.match(text);
        if (id != null) {
            score.linkComposer(composerRepository.getReferenceById(id));
        }
    }
}
