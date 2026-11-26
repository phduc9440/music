package com.ptit.music_be.websocket;

import java.security.Principal;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.socket.server.support.DefaultHandshakeHandler;

import com.ptit.music_be.configuration.AuthCookies;
import com.ptit.music_be.configuration.CustomJwtDecoder;

import lombok.RequiredArgsConstructor;

/**
 * Xác thực lúc bắt tay WebSocket bằng đúng access token của API thường (cookie HttpOnly, hoặc header Authorization cho
 * client không phải trình duyệt). Dùng {@link CustomJwtDecoder} nên token hết hạn, token refresh, tài khoản bị khóa hay
 * token cấp trước lần đổi mật khẩu đều bị từ chối. Principal của phiên là email, để gửi riêng cho từng người bằng
 * {@code convertAndSendToUser}.
 */
@Component
@RequiredArgsConstructor
public class WebSocketAuthHandshake extends DefaultHandshakeHandler implements HandshakeInterceptor {

    static final String EMAIL_ATTR = "email";

    private final CustomJwtDecoder jwtDecoder;

    @Override
    public boolean beforeHandshake(
            ServerHttpRequest request,
            ServerHttpResponse response,
            WebSocketHandler wsHandler,
            Map<String, Object> attributes) {
        String token = tokenOf(request);
        if (token == null) {
            return reject(response);
        }
        try {
            Jwt jwt = jwtDecoder.decode(token);
            if (jwt.getSubject() == null) {
                return reject(response);
            }
            attributes.put(EMAIL_ATTR, jwt.getSubject());
            return true;
        } catch (JwtException e) {
            return reject(response);
        }
    }

    @Override
    public void afterHandshake(
            ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler wsHandler, Exception exception) {}

    @Override
    protected Principal determineUser(
            ServerHttpRequest request, WebSocketHandler wsHandler, Map<String, Object> attributes) {
        String email = (String) attributes.get(EMAIL_ATTR);
        return email == null ? null : () -> email;
    }

    private static String tokenOf(ServerHttpRequest request) {
        if (!(request instanceof ServletServerHttpRequest servlet)) {
            return null;
        }
        String header = servlet.getServletRequest().getHeader("Authorization");
        if (header != null && header.regionMatches(true, 0, "Bearer ", 0, 7)) {
            return header.substring(7).trim();
        }
        return AuthCookies.read(servlet.getServletRequest(), AuthCookies.ACCESS);
    }

    private static boolean reject(ServerHttpResponse response) {
        response.setStatusCode(HttpStatus.UNAUTHORIZED);
        return false;
    }
}
