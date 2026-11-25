package com.ptit.music_be.dto.enums.notification;

import java.util.Arrays;
import java.util.List;

/**
 * Nhóm thông báo để người dùng bật/tắt (mục R8). Mỗi {@link NotificationType} thuộc đúng một nhóm; nhóm {@link #SYSTEM}
 * (thông báo chung của admin) luôn hiện trong ứng dụng và không chỉnh được.
 */
public enum NotificationCategory {
    SCORES,
    COMMENTS,
    TEAMS,
    FORUM,
    BILLING,
    SYSTEM;

    /** Nhóm của một loại thông báo. */
    public static NotificationCategory of(NotificationType type) {
        return switch (type) {
            case ACCESS_REQUESTED,
                    ACCESS_APPROVED,
                    ACCESS_REJECTED,
                    SHARED_WITH_YOU,
                    PUBLISH_REQUESTED,
                    PUBLISH_APPROVED,
                    PUBLISH_REJECTED,
                    NEW_REVIEW,
                    SCORE_FORKED,
                    SCORE_TRASHED_BY_ADMIN,
                    OFFICIAL_REQUESTED,
                    OFFICIAL_ACCEPTED,
                    OFFICIAL_DECLINED,
                    AI_TASK_COMPLETED,
                    AI_TASK_FAILED -> SCORES;
            case COMMENT_MENTION, COMMENT_REPLY, SUGGESTION_NEW, SUGGESTION_DECIDED -> COMMENTS;
            case TEAM_INVITED,
                    TEAM_MEMBER_JOINED,
                    TEAM_ROLE_CHANGED,
                    TEAM_REMOVED,
                    TEAM_DELETED_BY_ADMIN,
                    TEAM_DELETED,
                    TEAM_RESTORED,
                    SHOW_ITEM_ASSIGNED,
                    SHOW_ITEM_SUBMITTED,
                    SHOW_ITEM_APPROVED,
                    SHOW_ITEM_RETURNED,
                    SHOW_ITEM_DUE -> TEAMS;
            case FORUM_REPLY, FORUM_POST_REPLY, FORUM_ANSWER_ACCEPTED -> FORUM;
            case PLAN_ACTIVATED, PLAN_EXPIRING, PLAN_REVOKED, PLAN_BANNED, PLAN_BAN_LIFTED -> BILLING;
            case ANNOUNCEMENT -> SYSTEM;
        };
    }

    /** Các nhóm người dùng được chỉnh. */
    public static List<NotificationCategory> configurable() {
        return Arrays.stream(values()).filter(c -> c != SYSTEM).toList();
    }

    /** Các loại thông báo thuộc nhóm này. */
    public List<NotificationType> types() {
        return Arrays.stream(NotificationType.values())
                .filter(t -> of(t) == this)
                .toList();
    }
}
