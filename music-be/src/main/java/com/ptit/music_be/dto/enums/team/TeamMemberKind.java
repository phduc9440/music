package com.ptit.music_be.dto.enums.team;

/** Loại dòng trong bảng team_members: thành viên, lời mời, nhật ký hoạt động hay bảng quyền của một vai trò. */
public enum TeamMemberKind {
    /** Thành viên: member, role, joinedAt. */
    MEMBER,
    /** Lời mời: email (null = link), role, tokenHash, status, invitedBy, expiresAt; member/joinedAt = người và lúc chấp nhận. */
    INVITATION,
    /** Nhật ký hoạt động: member = người làm, type, params. */
    ACTIVITY,
    /**
     * Quyền của một vai trò do chủ nhóm chỉnh: role = vai trò (MANAGER / ARRANGER / VIEWER), params = mảng JSON tên
     * {@link TeamPermission}. Mỗi team tối đa một dòng cho mỗi vai trò; chưa có dòng thì dùng quyền mặc định.
     */
    PERMISSION
}
