package com.ptit.music_be.service.team;

import org.springframework.stereotype.Component;

import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.TeamMember;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.TeamMemberRepository;
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

    /** Như {@link #membership} nhưng phải là OWNER hoặc MANAGER. */
    public TeamMember requireManager(String teamId, Member me) {
        TeamMember tm = membership(teamId, me);
        if (!tm.getRole().canManage()) {
            throw new AppException(ErrorCode.TEAM_FORBIDDEN);
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
