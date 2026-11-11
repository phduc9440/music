package com.ptit.music_be.event;

/**
 * Lý do thưởng điểm (mục 7.5). Phần của Đức chỉ phát {@link RewardEarnedEvent}; sổ điểm (points_ledger, của Công) nghe
 * sự kiện, cộng điểm theo bảng này và tự áp giới hạn. Khóa chống cộng trùng là {@code (reason, refId)}.
 */
public enum RewardReason {
    /** Bản nhạc của bạn được quản trị viên duyệt công khai. refId = id bản nhạc. */
    SCORE_PUBLISHED(30, 20, 5, Window.WEEK),
    /** Bạn đồng ý đưa bản nhạc vào kho bản nhạc mẫu. refId = id lời xin. */
    SCORE_OFFICIAL(100, 100, 0, Window.NONE),
    /** Người bạn mời đăng ký và số hóa xong 1 bản (thưởng cả hai bên). refId = id người được mời. Chưa phát. */
    REFERRAL_DIGITIZED(50, 50, 10, Window.MONTH),
    /** Câu trả lời của bạn trên diễn đàn được chọn. refId = id câu trả lời. Chưa phát (chờ 5.5). */
    FORUM_ANSWER_ACCEPTED(15, 10, 5, Window.DAY);

    public enum Window {
        NONE,
        DAY,
        WEEK,
        MONTH
    }

    private final int xp;
    private final int notes;
    private final int limit;
    private final Window window;

    RewardReason(int xp, int notes, int limit, Window window) {
        this.xp = xp;
        this.notes = notes;
        this.limit = limit;
        this.window = window;
    }

    public int xp() {
        return xp;
    }

    /** Số "Nốt" (tiền tệ trong ứng dụng) được thưởng. */
    public int notes() {
        return notes;
    }

    /** Số lần tối đa được thưởng trong một {@link #window()}; 0 = không giới hạn. */
    public int limit() {
        return limit;
    }

    public Window window() {
        return window;
    }
}
