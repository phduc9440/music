package com.ptit.music_be.service.collab.live;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextImpl;
import org.springframework.stereotype.Component;

import com.ptit.music_be.configuration.MemberStatusGuard;
import com.ptit.music_be.entity.Role;

import lombok.RequiredArgsConstructor;

/**
 * Chạy một đoạn mã dưới danh nghĩa một người dùng ngoài luồng HTTP. Kênh WebSocket (và job nền) không có
 * {@code SecurityContext} nên mọi service dùng {@code SecurityUtils.getCurrentEmail()} đều hỏng nếu không đặt trước.
 * Vai trò lấy từ DB như {@code SecurityConfig.jwtAuthenticationConverter}, nên quyền thu hồi có hiệu lực ngay.
 */
@Component
@RequiredArgsConstructor
public class LiveSecurity {

    private final MemberStatusGuard memberStatusGuard;

    public <T> T runAs(String email, Supplier<T> action) {
        SecurityContext previous = SecurityContextHolder.getContext();
        try {
            SecurityContext context = new SecurityContextImpl(authentication(email));
            SecurityContextHolder.setContext(context);
            return action.get();
        } finally {
            SecurityContextHolder.setContext(previous);
        }
    }

    public void runAs(String email, Runnable action) {
        runAs(email, () -> {
            action.run();
            return null;
        });
    }

    private UsernamePasswordAuthenticationToken authentication(String email) {
        List<GrantedAuthority> authorities = new ArrayList<>();
        for (String role : memberStatusGuard.roleNames(email)) {
            authorities.add(new SimpleGrantedAuthority("ROLE_" + role));
            if (Role.SUPER_ADMIN.equals(role)) {
                authorities.add(new SimpleGrantedAuthority("ROLE_" + Role.ADMIN));
            }
        }
        return UsernamePasswordAuthenticationToken.authenticated(email, null, authorities);
    }
}
