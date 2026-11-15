package com.ptit.music_be.utils;

import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.configuration.RolePermissionRegistry;
import com.ptit.music_be.dto.enums.auth.AdminPermission;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;

public final class SecurityUtils {

    static final String ROLE_PREFIX = "ROLE_";

    private SecurityUtils() {}

    /** JWT subject = member email (see AuthServiceImpl#generateToken). */
    public static String getCurrentEmail() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new AppException(ErrorCode.UNAUTHENTICATED);
        }
        return authentication.getName();
    }

    /** Vai trò SUPER_ADMIN (tài khoản gốc): mọi quyền, riêng nó quản lý vai trò và gán vai trò. */
    public static boolean isSuperAdmin() {
        return hasAuthority(current(), "ROLE_SUPER_ADMIN");
    }

    /**
     * Có vai trò ADMIN (SUPER_ADMIN luôn kèm ROLE_ADMIN). Chỉ dùng cho quyền lợi gắn với vai trò (Pro không thời hạn của
     * ADMIN...); kiểm tra quyền quản trị thì dùng {@link #hasPermission}.
     */
    public static boolean isAdmin() {
        return hasAuthority(current(), "ROLE_ADMIN");
    }

    /** Người đang đăng nhập có quyền quản trị này không (theo vai trò hiện tại và bảng quyền của vai trò). */
    public static boolean hasPermission(AdminPermission permission) {
        return permissions(current()).contains(permission);
    }

    /** Có ít nhất một trong các quyền. */
    public static boolean hasAnyPermission(AdminPermission... permissions) {
        Set<AdminPermission> mine = permissions(current());
        for (AdminPermission p : permissions) {
            if (mine.contains(p)) {
                return true;
            }
        }
        return false;
    }

    /** Có ít nhất một quyền quản trị: vào được khu quản trị (/api/admin/**). */
    public static boolean hasAdminAccess(Authentication authentication) {
        return !permissions(authentication).isEmpty();
    }

    /** Ném UNAUTHORIZED nếu không có quyền. */
    public static void requirePermission(AdminPermission permission) {
        if (!hasPermission(permission)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
    }

    /** Quyền quản trị của một phiên đăng nhập (vai trò lấy từ các authority ROLE_*). */
    public static Set<AdminPermission> permissions(Authentication authentication) {
        if (authentication == null) {
            return Set.of();
        }
        Set<String> roles = authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .filter(a -> a != null && a.startsWith(ROLE_PREFIX))
                .map(a -> a.substring(ROLE_PREFIX.length()))
                .collect(Collectors.toSet());
        return RolePermissionRegistry.permissionsOf(roles);
    }

    private static Authentication current() {
        return SecurityContextHolder.getContext().getAuthentication();
    }

    private static boolean hasAuthority(Authentication authentication, String authority) {
        if (authentication == null) {
            return false;
        }
        return authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch(authority::equals);
    }
}
