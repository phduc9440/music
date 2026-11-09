package com.ptit.music_be.utils;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;

public final class SecurityUtils {

    private SecurityUtils() {}

    /** JWT subject = member email (see AuthServiceImpl#generateToken). */
    public static String getCurrentEmail() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new AppException(ErrorCode.UNAUTHENTICATED);
        }
        return authentication.getName();
    }

    /** SUPER_ADMIN: có mọi quyền của ADMIN và còn được sửa nội dung bản nhạc của người khác. */
    public static boolean isSuperAdmin() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null) {
            return false;
        }
        return authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch("ROLE_SUPER_ADMIN"::equals);
    }

    /** ADMIN hoặc SUPER_ADMIN (SUPER_ADMIN luôn được cấp kèm ROLE_ADMIN trong token, xem AuthServiceImpl). */
    public static boolean isAdmin() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null) {
            return false;
        }
        return authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch("ROLE_ADMIN"::equals);
    }
}
