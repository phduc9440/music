package com.ptit.music_be.dto.enums;

/** Loại hoạt động trong nhật ký team (tab Hoạt động); params đi kèm ghi ở từng chỗ ghi nhật ký trong TeamActivityLog. */
public enum TeamActivityType {
    TEAM_CREATED,
    TEAM_UPDATED,
    /** Team được khôi phục sau khi xóa mềm; params: team, byAdmin ("true" nếu quản trị viên khôi phục). */
    TEAM_RESTORED,
    MEMBER_JOINED,
    MEMBER_LEFT,
    MEMBER_REMOVED,
    ROLE_CHANGED,
    INVITATION_SENT,
    SCORE_ADDED,
    SCORE_REMOVED,
    SHOW_CREATED,
    SHOW_UPDATED,
    SHOW_DELETED,
    /** Show được khôi phục; params: show, showId. */
    SHOW_RESTORED,
    ITEM_ADDED,
    ITEM_REMOVED,
    ITEM_ASSIGNED,
    ITEM_STATUS_CHANGED
}
