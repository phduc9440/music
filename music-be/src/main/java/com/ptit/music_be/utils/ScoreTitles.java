package com.ptit.music_be.utils;

import org.springframework.util.StringUtils;

/**
 * Quy tắc tên bài hát dùng chung cho mọi đường tạo/sửa bản nhạc (T37).
 *
 * <ul>
 *   <li>Tên người dùng tự gõ: tối đa {@link #MAX_LENGTH} ký tự, dài hơn thì báo lỗi {@code SCORE_TITLE_INVALID} (2017),
 *       không âm thầm cắt.
 *   <li>Tên tự suy ra (tên file ảnh/PDF/MusicXML tải lên, work-title trong file): giữ nguyên nếu vừa, dài hơn
 *       {@link #MAX_LENGTH} hoặc rỗng thì dùng {@link #UNTITLED}. Người dùng đổi tên sau.
 * </ul>
 *
 * <p>Cột {@code scores.title} vẫn là VARCHAR(255): tên cũ dài hơn 80 ký tự giữ nguyên, chỉ kiểm khi tên được đổi.
 */
public final class ScoreTitles {

    public static final int MAX_LENGTH = 80;

    /** Tên mặc định khi không có tên hoặc tên suy ra quá dài. */
    public static final String UNTITLED = "Untitled";

    private ScoreTitles() {}

    /** Tên người dùng gõ (đã bỏ khoảng trắng hai đầu) có hợp lệ không: không rỗng và không quá {@link #MAX_LENGTH}. */
    public static boolean isValid(String title) {
        if (title == null) {
            return false;
        }
        String trimmed = title.strip();
        return !trimmed.isEmpty() && trimmed.length() <= MAX_LENGTH;
    }

    /** Tên người dùng gõ có quá dài không (null hoặc rỗng không tính là quá dài). */
    public static boolean isTooLong(String title) {
        return title != null && title.strip().length() > MAX_LENGTH;
    }

    /**
     * Tên lấy từ nguồn tự động (tên file đã bỏ đuôi, work-title...): bỏ khoảng trắng hai đầu; rỗng hoặc dài hơn
     * {@link #MAX_LENGTH} thì trả {@link #UNTITLED}.
     */
    public static String fromSource(String candidate) {
        if (!StringUtils.hasText(candidate)) {
            return UNTITLED;
        }
        String trimmed = candidate.strip();
        return trimmed.length() > MAX_LENGTH ? UNTITLED : trimmed;
    }

    /** Tên file tải lên (có thể kèm đường dẫn, đuôi) → tên bài theo {@link #fromSource(String)}. */
    public static String fromFileName(String originalFileName) {
        if (originalFileName == null) {
            return UNTITLED;
        }
        String name = StringUtils.getFilename(StringUtils.cleanPath(originalFileName));
        return fromSource(name == null ? null : StringUtils.stripFilenameExtension(name));
    }
}
