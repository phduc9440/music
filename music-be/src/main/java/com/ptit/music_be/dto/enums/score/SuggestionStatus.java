package com.ptit.music_be.dto.enums.score;

import java.util.List;

/** Trạng thái của một đề xuất sửa (mục 4.3). Chỉ {@link #OPEN} là đang chờ xử lý, các trạng thái còn lại là đã đóng. */
public enum SuggestionStatus {
    OPEN,
    /** Đã nhận tất cả các ô. */
    ACCEPTED,
    /** Nhận một số ô, bỏ các ô còn lại. */
    PARTIAL,
    REJECTED,
    /** Người đề xuất rút lại. */
    WITHDRAWN,
    /** Bị từ chối khi đã lỗi thời (bản chính đổi cấu trúc sau khi đề xuất). */
    OUTDATED;

    /** Mọi trạng thái đã đóng. */
    public static final List<SuggestionStatus> CLOSED = List.of(ACCEPTED, PARTIAL, REJECTED, WITHDRAWN, OUTDATED);
}
