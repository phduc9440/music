package com.ptit.music_be.service.admin.impl;

import java.text.Normalizer;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.configuration.MemberStatusGuard;
import com.ptit.music_be.configuration.RolePermissionRegistry;
import com.ptit.music_be.dto.enums.auth.AdminPermission;
import com.ptit.music_be.dto.request.admin.RoleRequest;
import com.ptit.music_be.dto.response.admin.RoleResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.MemberRole;
import com.ptit.music_be.entity.Role;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.auth.MemberRoleRepository;
import com.ptit.music_be.repository.auth.RoleRepository;
import com.ptit.music_be.service.admin.RoleService;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@PreAuthorize("@perm.superAdmin()")
public class RoleServiceImpl implements RoleService {

    static final int MAX_LABEL = 100;
    static final int MAX_DESCRIPTION = 255;
    static final int MAX_CODE = 60;

    RoleRepository roleRepository;
    MemberRoleRepository memberRoleRepository;
    RolePermissionRegistry registry;
    MemberStatusGuard memberStatusGuard;

    @Override
    @Transactional(readOnly = true)
    public List<RoleResponse> list() {
        Map<String, Long> counts = new HashMap<>();
        for (Object[] r : roleRepository.countMembersByRole()) {
            counts.put((String) r[0], ((Number) r[1]).longValue());
        }
        return roleRepository.findAllWithPermissions().stream()
                .sorted(java.util.Comparator.comparing((Role r) -> order(r.getName()))
                        .thenComparing(Role::getName))
                .map(r -> toResponse(r, counts.getOrDefault(r.getId(), 0L)))
                .toList();
    }

    @Override
    @Transactional
    public RoleResponse create(RoleRequest request) {
        String label = cleanLabel(request);
        if (roleRepository.existsByLabelIgnoreCase(label)) {
            throw new AppException(ErrorCode.ROLE_LABEL_DUPLICATED);
        }
        String code = uniqueCode(label);
        Role role = Role.builder()
                .name(code)
                .label(label)
                .description(cleanDescription(request))
                .permissions(permissionsOf(request))
                .build();
        role = roleRepository.save(role);
        registry.invalidate();
        return toResponse(role, 0);
    }

    @Override
    @Transactional
    public RoleResponse update(String id, RoleRequest request) {
        Role role = find(id);
        if (Role.USER.equals(role.getName()) || Role.SUPER_ADMIN.equals(role.getName())) {
            throw new AppException(ErrorCode.ROLE_BUILT_IN);
        }
        if (!role.isBuiltIn()) {
            String label = cleanLabel(request);
            if (!label.equalsIgnoreCase(role.getLabel()) && roleRepository.existsByLabelIgnoreCase(label)) {
                throw new AppException(ErrorCode.ROLE_LABEL_DUPLICATED);
            }
            role.setLabel(label);
            role.setDescription(cleanDescription(request));
        }
        role.getPermissions().clear();
        role.getPermissions().addAll(permissionsOf(request));
        roleRepository.save(role);
        registry.invalidate();
        // Quyền mới có hiệu lực ngay cho những người đang giữ vai trò này
        memberRoleRepository.findEmailsByRoleId(role.getId()).forEach(memberStatusGuard::evict);
        return toResponse(role, countMembers(role.getId()));
    }

    @Override
    @Transactional
    public void delete(String id) {
        Role role = find(id);
        if (role.isBuiltIn()) {
            throw new AppException(ErrorCode.ROLE_BUILT_IN);
        }
        // Gỡ vai trò khỏi người đang giữ: họ mất quyền của vai trò này, luôn còn USER (kể cả dữ liệu cũ thiếu USER)
        List<String> holders = memberRoleRepository.findEmailsByRoleId(role.getId());
        if (!holders.isEmpty()) {
            Role user = roleRepository
                    .findByName(Role.USER)
                    .orElseThrow(() -> new AppException(ErrorCode.ROLE_NOT_EXISTED));
            List<MemberRole> links = memberRoleRepository.findByRoleId(role.getId());
            for (MemberRole mr : links) {
                Member m = mr.getMember();
                if (!memberRoleRepository.existsByMemberAndRole(m, user)) {
                    memberRoleRepository.save(
                            MemberRole.builder().member(m).role(user).build());
                }
                m.getMemberRoles().remove(mr);
            }
            role.getMemberRoles().removeAll(links);
            memberRoleRepository.deleteAll(links);
            memberRoleRepository.flush();
            holders.forEach(memberStatusGuard::evict);
        }
        roleRepository.delete(role);
        registry.invalidate();
    }

    // ------------------------------------------------------------------------------------------------ helpers

    private Role find(String id) {
        return roleRepository
                .findById(id == null ? "" : id)
                .orElseThrow(() -> new AppException(ErrorCode.ROLE_NOT_EXISTED));
    }

    private long countMembers(String roleId) {
        return memberRoleRepository.findEmailsByRoleId(roleId).size();
    }

    private static int order(String name) {
        return switch (name) {
            case Role.SUPER_ADMIN -> 0;
            case Role.ADMIN -> 1;
            case Role.USER -> 2;
            default -> 3;
        };
    }

    private static Set<AdminPermission> permissionsOf(RoleRequest request) {
        Set<AdminPermission> wanted = request.getPermissions() == null
                ? EnumSet.noneOf(AdminPermission.class)
                : request.getPermissions().stream()
                        .filter(Objects::nonNull)
                        .collect(Collectors.toCollection(() -> EnumSet.noneOf(AdminPermission.class)));
        return AdminPermission.withRequired(wanted);
    }

    private static String cleanLabel(RoleRequest request) {
        String label = request == null || request.getLabel() == null
                ? ""
                : request.getLabel().trim();
        if (label.length() < 2 || label.length() > MAX_LABEL) {
            throw new AppException(ErrorCode.ROLE_LABEL_INVALID);
        }
        return label;
    }

    private static String cleanDescription(RoleRequest request) {
        String d =
                request.getDescription() == null ? "" : request.getDescription().trim();
        if (d.length() > MAX_DESCRIPTION) {
            throw new AppException(ErrorCode.ROLE_LABEL_INVALID);
        }
        return d.isEmpty() ? null : d;
    }

    /** Mã từ tên: bỏ dấu, chữ hoa, ký tự khác chữ / số thành "_"; thêm số nếu trùng hoặc trùng vai trò có sẵn. */
    private String uniqueCode(String label) {
        String base = Normalizer.normalize(label.replace('đ', 'd').replace('Đ', 'D'), Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .toUpperCase(Locale.ROOT)
                .replaceAll("[^A-Z0-9]+", "_")
                .replaceAll("^_+|_+$", "");
        if (base.isEmpty()) {
            base = "ROLE";
        }
        if (base.length() > MAX_CODE) {
            base = base.substring(0, MAX_CODE);
        }
        String code = base;
        int n = 2;
        while (Role.isBuiltIn(code) || roleRepository.existsByName(code)) {
            code = base + "_" + n++;
        }
        return code;
    }

    private RoleResponse toResponse(Role r, long memberCount) {
        Set<AdminPermission> perms =
                Role.SUPER_ADMIN.equals(r.getName()) ? EnumSet.allOf(AdminPermission.class) : r.getPermissions();
        return RoleResponse.builder()
                .id(r.getId())
                .name(r.getName())
                .label(r.getLabel())
                .description(r.getDescription())
                .builtIn(r.isBuiltIn())
                .editable(!Role.USER.equals(r.getName()) && !Role.SUPER_ADMIN.equals(r.getName()))
                .memberCount(memberCount)
                .permissions(
                        List.copyOf(perms.isEmpty() ? EnumSet.noneOf(AdminPermission.class) : EnumSet.copyOf(perms)))
                .build();
    }
}
