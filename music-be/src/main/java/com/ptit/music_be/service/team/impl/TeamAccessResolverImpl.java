package com.ptit.music_be.service.team.impl;

import java.util.Optional;

import org.springframework.stereotype.Component;

import com.ptit.music_be.dto.enums.score.ScoreAccess;
import com.ptit.music_be.dto.enums.team.TeamPermission;
import com.ptit.music_be.dto.enums.team.TeamRole;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.repository.team.ShowItemRepository;
import com.ptit.music_be.repository.team.TeamMemberRepository;
import com.ptit.music_be.service.permission.TeamAccessResolver;
import com.ptit.music_be.service.team.RolePermissions;
import com.ptit.music_be.service.team.TeamPermissionStore;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

/**
 * Quyền qua team (mục 4.1, ma trận 2.3), theo bảng quyền của team: MANAGE_SCORES = như chủ bản nhạc (xóa, công khai, chia
 * sẻ ra ngoài; chủ nhóm luôn có); EDIT_SCORES = sửa mọi bản (mặc định quản lý); người được giao phối bài trong một show của
 * team sửa được bài đó; COMMENT = nhận xét (mặc định quản lý, người phối); còn lại chỉ xem. ScorePermissionService lấy mức
 * cao hơn giữa mức này và chia sẻ cá nhân, chủ bản nhạc luôn là OWNER.
 */
@Component
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class TeamAccessResolverImpl implements TeamAccessResolver {

    TeamMemberRepository teamMemberRepository;
    ShowItemRepository showItemRepository;
    TeamPermissionStore permissionStore;

    @Override
    public Optional<ScoreAccess> resolve(Score score, String memberId) {
        String teamId = score.getTeamId();
        if (teamId == null) {
            return Optional.empty();
        }
        return teamMemberRepository.findByTeamIdAndMemberId(teamId, memberId).map(tm -> {
            RolePermissions perms = permissionStore.of(teamId, tm.getRole());
            if (perms.has(TeamPermission.MANAGE_SCORES)) {
                return ScoreAccess.OWNER;
            }
            if (perms.has(TeamPermission.EDIT_SCORES)) {
                return ScoreAccess.EDIT;
            }
            // Người xem không được giao việc (đổi sang người xem là bỏ phân công)
            if (tm.getRole() != TeamRole.VIEWER && showItemRepository.isArrangerOf(score.getId(), memberId, teamId)) {
                return ScoreAccess.EDIT;
            }
            return perms.has(TeamPermission.COMMENT) ? ScoreAccess.REVIEW : ScoreAccess.VIEW;
        });
    }
}
