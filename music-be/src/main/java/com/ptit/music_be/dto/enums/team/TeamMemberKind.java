package com.ptit.music_be.dto.enums.team;

/** Loại dòng trong bảng team_members: thành viên, lời mời hay nhật ký hoạt động. */
public enum TeamMemberKind {
    /** Thành viên: member, role, joinedAt. */
    MEMBER,
    /** Lời mời: email (null = link), role, tokenHash, status, invitedBy, expiresAt; member/joinedAt = người và lúc chấp nhận. */
    INVITATION,
    /** Nhật ký hoạt động: member = người làm, type, params. */
    ACTIVITY
}
