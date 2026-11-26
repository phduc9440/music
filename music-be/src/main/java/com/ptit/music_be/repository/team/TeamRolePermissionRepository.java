package com.ptit.music_be.repository.team;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ptit.music_be.dto.enums.team.TeamRole;
import com.ptit.music_be.entity.TeamRolePermission;

/** Quyền theo vai trò của team (bảng team_role_permissions, khóa team + vai trò). */
public interface TeamRolePermissionRepository extends JpaRepository<TeamRolePermission, TeamRolePermission.Key> {

    /** Các dòng bảng quyền (mỗi vai trò tối đa một dòng) của các team. */
    @Query("select p from TeamRolePermission p join fetch p.team where p.team.id in :teamIds")
    List<TeamRolePermission> findPermissions(@Param("teamIds") Collection<String> teamIds);

    /** Dòng bảng quyền của một vai trò trong team (chưa có = vai trò đó dùng quyền mặc định). */
    @Query("select p from TeamRolePermission p where p.team.id = :teamId and p.role = :role")
    Optional<TeamRolePermission> findPermission(@Param("teamId") String teamId, @Param("role") TeamRole role);
}
