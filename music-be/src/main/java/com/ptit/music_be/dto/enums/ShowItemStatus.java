package com.ptit.music_be.dto.enums;

/** Tiến độ một bài trong show (cột Kanban): chưa làm, đang phối, chờ duyệt, đã duyệt. */
public enum ShowItemStatus {
    TODO,
    ARRANGING,
    IN_REVIEW,
    APPROVED
}
