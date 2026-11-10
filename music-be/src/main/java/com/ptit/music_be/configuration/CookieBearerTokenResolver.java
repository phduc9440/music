package com.ptit.music_be.configuration;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;

/**
 * Lấy access token từ header Authorization (mobile/Swagger) hoặc cookie HttpOnly (web).
 * Các endpoint đăng nhập công khai bỏ qua token để token cũ/hỏng không làm login bị 401.
 */
public class CookieBearerTokenResolver implements BearerTokenResolver {
    private final DefaultBearerTokenResolver headerResolver = new DefaultBearerTokenResolver();

    @Override
    public String resolve(HttpServletRequest request) {
        String path = request.getRequestURI();
        if (path.startsWith("/api/auth/") && !path.equals("/api/auth/change-password")) return null;
        // API cho khách không cần biết ai đang xem; bỏ qua token để cookie hết hạn không làm khách bị 401
        if (path.startsWith("/api/public/")) return null;

        String header = headerResolver.resolve(request);
        return header != null ? header : AuthCookies.read(request, AuthCookies.ACCESS);
    }
}
