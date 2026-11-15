package com.ptit.music_be.service.team;

import org.springframework.stereotype.Component;

import com.ptit.music_be.dto.enums.team.TeamPermission;
import com.ptit.music_be.dto.enums.team.TeamRole;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.TeamMember;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.team.TeamMemberRepository;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

/**
 * Kiểm tra người đang đăng nhập có ở trong team không và với vai trò gì. Người ngoài team nhận "không tìm thấy team" để
 * không lộ team tồn tại (kể cả ADMIN: team là không gian riêng của nhóm).
 */
@Component
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class TeamAccess {

    MemberRepository memberRepository;
    TeamMemberRepository teamMemberRepository;
    TeamPermissionStore permissionStore;

    public Member currentMember() {
        return memberRepository
                .findByEmail(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
    }

    /** Tư cách thành viên của người đang đăng nhập trong team; không ở trong team thì báo TEAM_NOT_EXISTED. */
    public TeamMember membership(String teamId, Member me) {
        return teamMemberRepository
                .findByTeamIdAndMemberId(teamId == null ? "" : teamId, me.getId())
                .orElseThrow(() -> new AppException(ErrorCode.TEAM_NOT_EXISTED));
    }

    /** Quyền của tư cách thành viên này theo bảng quyền của team. */
    public RolePermissions permissions(TeamMember tm) {
        return permissionStore.of(tm);
    }

    /** Như {@link #membership} nhưng vai trò phải đang được bật quyền {@code permission}, không thì TEAM_FORBIDDEN. */
    public TeamMember require(String teamId, Member me, TeamPermission permission) {
        TeamMember tm = membership(teamId, me);
        if (!permissions(tm).has(permission)) {
            throw new AppException(ErrorCode.TEAM_FORBIDDEN);
        }
        return tm;
    }

    /** Như {@link #membership} nhưng phải là OWNER (việc của riêng chủ nhóm, quản lý nhận TEAM_OWNER_ONLY). */
    public TeamMember requireOwner(String teamId, Member me) {
        TeamMember tm = membership(teamId, me);
        if (tm.getRole() != TeamRole.OWNER) {
            throw new AppException(ErrorCode.TEAM_OWNER_ONLY);
        }
        return tm;
    }

    public static String displayName(Member m) {
        if (m == null) {
            return null;
        }
        return m.getFullName() == null || m.getFullName().isBlank() ? m.getEmail() : m.getFullName();
    }
}
