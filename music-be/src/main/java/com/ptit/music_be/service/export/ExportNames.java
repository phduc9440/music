package com.ptit.music_be.service.export;

/** Đặt tên file xuất (tải về, mục ZIP) từ tiêu đề bản nhạc. */
public final class ExportNames {

    private static final int MAX_TITLE_LENGTH = 100;

    private ExportNames() {}

    /** Tiêu đề bỏ ký tự không hợp lệ trong tên file, tối đa 100 ký tự; trống thì dùng "score". */
    public static String safeTitle(String title) {
        String clean = title == null
                ? ""
                : title.replaceAll("[/\\\\:*?\"<>|\\p{Cntrl}]", " ").trim();
        if (clean.length() > MAX_TITLE_LENGTH) {
            clean = clean.substring(0, MAX_TITLE_LENGTH).trim();
        }
        return clean.isEmpty() ? "score" : clean;
    }

    /** Ví dụ {@code Bài ca.mp3}. */
    public static String fileName(String title, String extension) {
        return safeTitle(title) + "." + extension;
    }

    /** Tên một trang SVG, ví dụ {@code Bài ca-trang-03.svg}. */
    public static String svgPageName(String title, int page) {
        return "%s-trang-%02d.svg".formatted(safeTitle(title), page);
    }
}
