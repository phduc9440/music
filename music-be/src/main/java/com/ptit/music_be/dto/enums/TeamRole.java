package com.ptit.music_be.dto.enums;

/**
 * Vai trò trong team (mục 4.1). OWNER/MANAGER quản lý team và là chủ mọi bản nhạc của team; ARRANGER (người phối) sửa
 * được bài được giao, chỉ nhận xét bài khác; VIEWER chỉ xem.
 */
public enum TeamRole {
    OWNER,
    MANAGER,
    ARRANGER,
    VIEWER;

    /** OWNER hoặc MANAGER: mời, đổi vai trò, xóa thành viên, quản lý show. */
    public boolean canManage() {
        return this == OWNER || this == MANAGER;
    }
}
