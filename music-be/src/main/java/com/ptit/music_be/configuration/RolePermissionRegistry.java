package com.ptit.music_be.configuration;

import java.util.Collection;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.ptit.music_be.dto.enums.auth.AdminPermission;
import com.ptit.music_be.entity.Role;
import com.ptit.music_be.repository.auth.RoleRepository;

/**
 * Bộ nhớ "vai trò → quyền quản trị" đọc từ bảng roles + role_permissions, nhớ ngắn ({@link #TTL_MILLIS}) để mọi lần kiểm
 * tra quyền không phải truy vấn DB; sửa / xóa vai trò thì gọi {@link #invalidate} nên có hiệu lực ngay trên máy chủ này
 * (nhiều máy chủ thì chậm nhất sau TTL). SUPER_ADMIN luôn đủ quyền, USER không có quyền quản trị nào (kể cả nếu ai đó ghi
 * thẳng vào DB).
 *
 * <p>{@link #permissionsOf} là hàm tĩnh để SecurityUtils và MemberMapper gọi được; khi chạy không có Spring (test đơn vị)
 * thì ADMIN dùng {@link AdminPermission#adminDefaults()}.
 */
@Component
public class RolePermissionRegistry {

    static final long TTL_MILLIS = 30_000;

    private static volatile RolePermissionRegistry instance;

    private final RoleRepository roleRepository;
    private volatile Map<String, Set<AdminPermission>> byRole = Map.of();
    private volatile long expiresAt;

    public RolePermissionRegistry(RoleRepository roleRepository) {
        this.roleRepository = roleRepository;
        instance = this;
    }

    /** Quyền quản trị của một tập vai trò (mã vai trò, không có tiền tố ROLE_). */
    public static Set<AdminPermission> permissionsOf(Collection<String> roleNames) {
        Set<AdminPermission> result = EnumSet.noneOf(AdminPermission.class);
        if (roleNames == null || roleNames.isEmpty()) {
            return result;
        }
        if (roleNames.contains(Role.SUPER_ADMIN)) {
            return EnumSet.allOf(AdminPermission.class);
        }
        RolePermissionRegistry registry = instance;
        Map<String, Set<AdminPermission>> map = registry == null ? null : registry.current();
        for (String name : roleNames) {
            if (name == null || Role.USER.equals(name)) {
                continue;
            }
            Set<AdminPermission> granted = map == null
                    ? (Role.ADMIN.equals(name) ? AdminPermission.adminDefaults() : null)
                    : map.get(name);
            if (granted != null) {
                result.addAll(granted);
            }
        }
        return result;
    }

    /** Bỏ bộ nhớ: lần kiểm tra quyền tiếp theo đọc lại từ DB. */
    public void invalidate() {
        expiresAt = 0;
    }

    private Map<String, Set<AdminPermission>> current() {
        if (System.currentTimeMillis() < expiresAt) {
            return byRole;
        }
        synchronized (this) {
            if (System.currentTimeMillis() >= expiresAt) {
                Map<String, Set<AdminPermission>> fresh = new HashMap<>();
                for (Role role : roleRepository.findAllWithPermissions()) {
                    fresh.put(
                            role.getName(),
                            role.getPermissions().isEmpty()
                                    ? EnumSet.noneOf(AdminPermission.class)
                                    : EnumSet.copyOf(role.getPermissions()));
                }
                byRole = fresh;
                expiresAt = System.currentTimeMillis() + TTL_MILLIS;
            }
            return byRole;
        }
    }
}
