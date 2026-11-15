package com.ptit.music_be.service.admin.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.EnumSet;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.auth.AdminPermission;
import com.ptit.music_be.dto.request.admin.RoleRequest;
import com.ptit.music_be.dto.response.admin.RoleResponse;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.service.admin.RoleService;
import com.ptit.music_be.utils.SecurityUtils;

/** Thêm / sửa / xóa vai trò và tích quyền (DB thật, mỗi test rollback). */
@SpringBootTest
@Transactional
class RoleServiceImplTest {

    @Autowired
    RoleService roleService;

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private static void as(String... roles) {
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("admin@music.com", "x", roles));
    }

    private static ErrorCode codeOf(Runnable r) {
        return assertThrows(AppException.class, r::run).getErrorCode();
    }

    @Test
    void onlySuperAdminManagesRoles() {
        as("ROLE_ADMIN");
        assertThrows(Exception.class, () -> roleService.list());
        as("ROLE_USER");
        assertThrows(Exception.class, () -> roleService.list());
    }

    @Test
    void createEditDeleteCustomRole() {
        as("ROLE_SUPER_ADMIN", "ROLE_ADMIN");
        RoleResponse created = roleService.create(new RoleRequest(
                "Kiểm duyệt viên", "Duyệt bài", List.of(AdminPermission.SCORES_APPROVE, AdminPermission.MEMBERS_LOCK)));
        assertEquals("KIEM_DUYET_VIEN", created.getName());
        // MEMBERS_LOCK kéo theo MEMBERS_VIEW
        assertEquals(
                EnumSet.of(AdminPermission.SCORES_APPROVE, AdminPermission.MEMBERS_LOCK, AdminPermission.MEMBERS_VIEW),
                EnumSet.copyOf(created.getPermissions()));
        assertEquals(
                ErrorCode.ROLE_LABEL_DUPLICATED,
                codeOf(() -> roleService.create(new RoleRequest("kiểm duyệt viên", null, List.of()))));
        assertEquals(ErrorCode.ROLE_LABEL_INVALID, codeOf(() -> roleService.create(new RoleRequest("a", null, null))));

        RoleResponse edited = roleService.update(
                created.getId(), new RoleRequest("Kiểm duyệt", null, List.of(AdminPermission.TAGS_MANAGE)));
        assertEquals("Kiểm duyệt", edited.getLabel());
        assertEquals(List.of(AdminPermission.TAGS_MANAGE), edited.getPermissions());

        roleService.delete(created.getId());
        assertFalse(roleService.list().stream().anyMatch(r -> r.getId().equals(created.getId())));
    }

    @Test
    void builtInRolesAreProtected() {
        as("ROLE_SUPER_ADMIN", "ROLE_ADMIN");
        RoleResponse admin = byName("ADMIN");
        RoleResponse user = byName("USER");
        RoleResponse superAdmin = byName("SUPER_ADMIN");
        assertEquals(EnumSet.allOf(AdminPermission.class), EnumSet.copyOf(superAdmin.getPermissions()));
        assertTrue(user.getPermissions().isEmpty());
        assertEquals(ErrorCode.ROLE_BUILT_IN, codeOf(() -> roleService.delete(admin.getId())));
        assertEquals(
                ErrorCode.ROLE_BUILT_IN,
                codeOf(() -> roleService.update(user.getId(), new RoleRequest("x1", null, List.of()))));
        assertEquals(
                ErrorCode.ROLE_BUILT_IN,
                codeOf(() -> roleService.update(superAdmin.getId(), new RoleRequest("x1", null, List.of()))));
        // ADMIN chỉ sửa quyền, tên giữ nguyên
        RoleResponse edited = roleService.update(
                admin.getId(), new RoleRequest("bị bỏ qua", null, List.of(AdminPermission.DASHBOARD_VIEW)));
        assertEquals(null, edited.getLabel());
        assertEquals(List.of(AdminPermission.DASHBOARD_VIEW), edited.getPermissions());
    }

    @Test
    void permissionsFollowTheRoleTable() {
        as("ROLE_ADMIN");
        // ADMIN mặc định: kiểm duyệt có, cấp gói và sửa gói không
        assertTrue(SecurityUtils.hasPermission(AdminPermission.SCORES_APPROVE));
        assertFalse(SecurityUtils.hasPermission(AdminPermission.SUBSCRIPTIONS_MANAGE));
        assertFalse(SecurityUtils.hasPermission(AdminPermission.PLANS_MANAGE));
        as("ROLE_USER");
        assertFalse(
                SecurityUtils.hasAdminAccess(SecurityContextHolder.getContext().getAuthentication()));
        as("ROLE_SUPER_ADMIN", "ROLE_ADMIN");
        assertTrue(SecurityUtils.hasPermission(AdminPermission.PLANS_MANAGE));
    }

    private RoleResponse byName(String name) {
        return roleService.list().stream()
                .filter(r -> r.getName().equals(name))
                .findFirst()
                .orElseThrow();
    }

    @Test
    void deletingARoleStripsItFromHoldersAndKeepsUser(
            @org.springframework.beans.factory.annotation.Autowired
                    com.ptit.music_be.repository.auth.MemberRepository members,
            @org.springframework.beans.factory.annotation.Autowired
                    com.ptit.music_be.repository.auth.MemberRoleRepository memberRoles,
            @org.springframework.beans.factory.annotation.Autowired
                    com.ptit.music_be.repository.auth.RoleRepository roleRepo) {
        as("ROLE_SUPER_ADMIN", "ROLE_ADMIN");
        RoleResponse created =
                roleService.create(new RoleRequest("Tạm thời", null, List.of(AdminPermission.TAGS_MANAGE)));
        var member = members.findByEmail("lan.nguyen@music.com").orElseThrow();
        memberRoles.save(com.ptit.music_be.entity.MemberRole.builder()
                .member(member)
                .role(roleRepo.findById(created.getId()).orElseThrow())
                .build());
        roleService.delete(created.getId());
        var names = memberRoles.findRoleNamesByEmail("lan.nguyen@music.com");
        assertFalse(names.contains(created.getName()));
        assertTrue(names.contains("USER"));
    }
}
