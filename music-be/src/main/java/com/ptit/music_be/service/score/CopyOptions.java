package com.ptit.music_be.service.score;

import com.ptit.music_be.dto.enums.score.ScoreSource;

/**
 * Tùy chọn khi sao chép bản nhạc.
 *
 * @param title tiêu đề của bản mới; null hoặc rỗng thì giữ nguyên tiêu đề bản gốc
 * @param sourceType nguồn của bản mới ({@code Score.sourceType}); null thì dùng {@link ScoreSource#MANUAL}
 * @param keepComposer giữ tên tác giả của bản gốc
 * @param keepTags giữ các thể loại của bản gốc
 */
public record CopyOptions(String title, ScoreSource sourceType, boolean keepComposer, boolean keepTags) {

    /** Giữ tiêu đề, tác giả và thể loại; nguồn MANUAL. */
    public static CopyOptions defaults() {
        return new CopyOptions(null, null, true, true);
    }
}
