package com.ptit.music_be.dto.enums;

/** Loại hoạt động trong nhật ký team (tab Hoạt động); params đi kèm ghi ở từng chỗ ghi nhật ký trong TeamActivityLog. */
public enum TeamActivityType {
    TEAM_CREATED,
    TEAM_UPDATED,
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
    ITEM_ADDED,
    ITEM_REMOVED,
    ITEM_ASSIGNED,
    ITEM_STATUS_CHANGED
}
