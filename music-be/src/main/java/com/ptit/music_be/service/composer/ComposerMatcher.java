package com.ptit.music_be.service.composer;

import java.text.Normalizer;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import lombok.RequiredArgsConstructor;

/**
 * Tìm nhạc sĩ ứng với chữ "tác giả" người dùng nhập cho bản nhạc. So sánh sau khi bỏ dấu, viết thường và gom dấu câu
 * thành khoảng trắng, với tên chính và từng tên khác (aliases): "J.S. Bach", "j s bach", "Bach" đều khớp Bach.
 *
 * <p>Danh sách nhạc sĩ (bảng nhỏ) được nhớ trong bộ nhớ và đọc bằng JDBC, không qua Hibernate, vì hàm này chạy cả trong
 * lúc Hibernate đang flush (ScoreComposerListener). Thêm/sửa/xóa nhạc sĩ thì gọi {@link #invalidate()}.
 */
@Component
@RequiredArgsConstructor
public class ComposerMatcher {

    private final JdbcTemplate jdbcTemplate;

    /** Tên đã chuẩn hóa → id nhạc sĩ. */
    private volatile Map<String, String> index;

    public String match(String composerText) {
        if (!StringUtils.hasText(composerText)) {
            return null;
        }
        String key = normalize(composerText);
        return key.isEmpty() ? null : index().get(key);
    }

    public void invalidate() {
        index = null;
    }

    private Map<String, String> index() {
        Map<String, String> current = index;
        if (current != null) {
            return current;
        }
        Map<String, String> built = new HashMap<>();
        List<String[]> rows = jdbcTemplate.query(
                "select c.id, c.name, a.alias from composers c"
                        + " left join composer_aliases a on a.composer_id = c.id"
                        + " order by c.created_at, c.id, a.position",
                (rs, i) -> new String[] {rs.getString(1), rs.getString(2), rs.getString(3)});
        for (String[] row : rows) {
            // Tên trùng nhau giữa hai nhạc sĩ: giữ người tạo trước
            built.putIfAbsent(normalize(row[1]), row[0]);
            // Một dòng cho mỗi tên khác (composer_aliases), nhạc sĩ không có tên khác thì alias null
            String k = normalize(row[2]);
            if (!k.isEmpty()) {
                built.putIfAbsent(k, row[0]);
            }
        }
        built.remove("");
        index = built;
        return built;
    }

    /** Bỏ dấu, đ → d, viết thường, mọi ký tự không phải chữ/số thành một khoảng trắng. */
    public static String normalize(String text) {
        if (text == null) {
            return "";
        }
        String s = Normalizer.normalize(text, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .replace('đ', 'd')
                .replace('Đ', 'D')
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", " ");
        return s.trim();
    }

    /** Slug cho đường dẫn /composers/:slug, cùng quy tắc với slug thể loại. */
    public static String slugify(String text) {
        return normalize(text).replace(' ', '-');
    }
}
