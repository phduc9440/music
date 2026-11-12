package com.ptit.music_be.service.team;

import java.util.ArrayList;
import java.util.Collection;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.enums.team.TeamMemberKind;
import com.ptit.music_be.dto.enums.team.TeamPermission;
import com.ptit.music_be.dto.enums.team.TeamRole;
import com.ptit.music_be.entity.Team;
import com.ptit.music_be.entity.TeamMember;
import com.ptit.music_be.repository.team.TeamMemberRepository;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;

/**
 * Đọc / ghi bảng quyền của team: mỗi vai trò chỉnh được (MANAGER, ARRANGER, VIEWER) là một dòng kind = PERMISSION trong
 * team_members, params là mảng JSON tên quyền. Vai trò chưa có dòng thì dùng {@link TeamPermission#defaultsOf}.
 */
@Slf4j
@Component
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class TeamPermissionStore {

    /** Các vai trò chủ nhóm chỉnh được quyền (OWNER luôn đủ quyền). */
    public static final List<TeamRole> CONFIGURABLE = List.of(TeamRole.MANAGER, TeamRole.ARRANGER, TeamRole.VIEWER);

    static final TypeReference<List<String>> LIST = new TypeReference<>() {};

    TeamMemberRepository repository;
    ObjectMapper objectMapper;

    /** Quyền của người có tư cách thành viên {@code tm}. */
    public RolePermissions of(TeamMember tm) {
        return of(tm.getTeam().getId(), tm.getRole());
    }

    public RolePermissions of(String teamId, TeamRole role) {
        if (role == TeamRole.OWNER) {
            return new RolePermissions(role, null);
        }
        Set<TeamPermission> granted = repository
                .findPermission(teamId, role)
                .map(this::parse)
                .orElseGet(() -> TeamPermission.defaultsOf(role));
        return new RolePermissions(role, granted);
    }

    /** Bảng quyền đầy đủ của team cho các vai trò chỉnh được. */
    public Map<TeamRole, Set<TeamPermission>> matrix(String teamId) {
        return matrices(List.of(teamId)).get(teamId);
    }

    /** Bảng quyền của nhiều team một lần (danh sách team của tôi). */
    public Map<String, Map<TeamRole, Set<TeamPermission>>> matrices(Collection<String> teamIds) {
        Map<String, Map<TeamRole, Set<TeamPermission>>> result = new HashMap<>();
        for (String id : teamIds) {
            Map<TeamRole, Set<TeamPermission>> m = new EnumMap<>(TeamRole.class);
            CONFIGURABLE.forEach(r -> m.put(r, TeamPermission.defaultsOf(r)));
            result.put(id, m);
        }
        if (!teamIds.isEmpty()) {
            for (TeamMember row : repository.findPermissions(teamIds)) {
                Map<TeamRole, Set<TeamPermission>> m = result.get(row.getTeam().getId());
                if (m != null && row.getRole() != null && row.getRole() != TeamRole.OWNER) {
                    m.put(row.getRole(), parse(row));
                }
            }
        }
        return result;
    }

    /** Ghi quyền của một vai trò (đã thêm quyền phải có kèm); trả về bộ quyền đã lưu. */
    public Set<TeamPermission> save(Team team, TeamRole role, Set<TeamPermission> permissions) {
        Set<TeamPermission> normalized = TeamPermission.withRequired(permissions);
        TeamMember row = repository
                .findPermission(team.getId(), role)
                .orElseGet(() -> TeamMember.builder()
                        .kind(TeamMemberKind.PERMISSION)
                        .team(team)
                        .role(role)
                        .build());
        List<String> names = new ArrayList<>();
        // Ghi theo thứ tự khai báo để dễ đọc khi xem thẳng trong DB
        for (TeamPermission p : TeamPermission.values()) {
            if (normalized.contains(p)) {
                names.add(p.name());
            }
        }
        try {
            row.setParams(objectMapper.writeValueAsString(names));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
        repository.save(row);
        return normalized;
    }

    private Set<TeamPermission> parse(TeamMember row) {
        Set<TeamPermission> result = EnumSet.noneOf(TeamPermission.class);
        if (row.getParams() == null) {
            return result;
        }
        try {
            for (String name : objectMapper.readValue(row.getParams(), LIST)) {
                try {
                    result.add(TeamPermission.valueOf(name));
                } catch (IllegalArgumentException ignored) {
                    // Quyền đã bỏ khỏi enum: bỏ qua
                }
            }
        } catch (JsonProcessingException e) {
            log.warn("Bảng quyền team {} vai trò {} không đọc được, dùng mặc định", row.getTeam().getId(), row.getRole());
            return TeamPermission.defaultsOf(row.getRole());
        }
        return result;
    }
}
