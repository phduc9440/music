package com.ptit.music_be.service.score.impl;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;

import org.springframework.stereotype.Component;

import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.service.billing.EntitlementService;

import lombok.RequiredArgsConstructor;

/**
 * Quy tắc giữ phiên bản MusicXML theo gói của <b>chủ bản nhạc</b> ({@code keptVersions}): người xem chỉ thấy số version
 * mới nhất mà gói cho phép, còn file thật chỉ bị xóa khi vừa nằm ngoài số đang lưu vừa đã quá {@link #GRACE} ngày để nâng
 * gói lại thì thấy được các version cũ.
 */
@Component
@RequiredArgsConstructor
class VersionRetention {

    /** Số version tối thiểu còn lưu trên đĩa dù gói giữ ít hơn. */
    static final int MIN_STORED = 20;

    /** Version nằm ngoài số đang lưu chỉ bị xóa khi cũ hơn khoảng này. */
    static final Duration GRACE = Duration.ofDays(30);

    private final EntitlementService entitlementService;

    static int versionOf(ScoreFile file) {
        return file.getVersion() == null ? 1 : file.getVersion();
    }

    /** Các version người xem thấy được, mới nhất trước. Bản không có chủ (kho mẫu) hoặc gói không giới hạn thì thấy hết. */
    List<ScoreFile> visible(Score score, List<ScoreFile> xmlFiles) {
        List<ScoreFile> newestFirst = xmlFiles.stream()
                .sorted(Comparator.comparingInt(VersionRetention::versionOf).reversed())
                .toList();
        Integer kept = keptVersions(score);
        // Luôn thấy ít nhất version hiện hành dù gói ghi 0
        return kept == null
                ? newestFirst
                : newestFirst.stream().limit(Math.max(kept, 1)).toList();
    }

    /**
     * Các version cần xóa khỏi đĩa: nằm ngoài số đang lưu ({@code max(keptVersions, 20)}, gói không giới hạn thì giữ hết)
     * và đã cũ hơn {@link #GRACE}. {@code newestFirst} phải sắp theo version giảm dần.
     */
    List<ScoreFile> expired(Score score, List<ScoreFile> newestFirst) {
        int stored = storedLimit(score);
        if (newestFirst.size() <= stored) {
            return List.of();
        }
        LocalDateTime cutoff = LocalDateTime.now().minus(GRACE);
        return newestFirst.subList(stored, newestFirst.size()).stream()
                .filter(f -> f.getCreatedAt() != null && f.getCreatedAt().isBefore(cutoff))
                .toList();
    }

    private int storedLimit(Score score) {
        if (score.getMember() == null) {
            return MIN_STORED;
        }
        Integer kept = keptVersions(score);
        return kept == null ? Integer.MAX_VALUE : Math.max(kept, MIN_STORED);
    }

    private Integer keptVersions(Score score) {
        return score.getMember() == null
                ? null
                : entitlementService.limitsOf(score.getMember().getId()).keptVersions();
    }
}
