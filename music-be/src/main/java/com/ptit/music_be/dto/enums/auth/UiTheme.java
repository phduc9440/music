package com.ptit.music_be.dto.enums;

/** Giao diện thành viên chọn. Chưa chọn (null) được hiểu là {@link #SYSTEM}. */
public enum UiTheme {
    LIGHT,
    DARK,
    /** Theo cài đặt sáng/tối của hệ điều hành. */
    SYSTEM
}
