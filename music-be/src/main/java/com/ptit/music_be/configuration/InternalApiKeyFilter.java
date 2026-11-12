package com.ptit.music_be.configuration;

import java.io.IOException;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.response.common.ApiResponse;
import com.ptit.music_be.exception.ErrorCode;

import lombok.RequiredArgsConstructor;

/**
 * Bảo vệ các endpoint {@code /internal/**} (đặc tả mục 6.1, 6.3): không dùng JWT mà kiểm tra header
 * {@code X-Internal-Key} và địa chỉ nguồn. Khóa sai hoặc thiếu trả 401; nguồn không phải localhost/mạng nội bộ trả 403.
 *
 * <p>Cố ý KHÔNG khai báo là {@code @Component}: nếu không Spring Boot sẽ tự đăng ký filter này cho mọi request. Filter
 * chỉ được gắn vào chuỗi bảo mật của {@code /internal/**} trong {@link InternalSecurityConfig}.
 */
@RequiredArgsConstructor
public class InternalApiKeyFilter extends OncePerRequestFilter {

    private final AiServiceProperties properties;
    private final ObjectMapper objectMapper;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        if (!isInternalAddress(request.getRemoteAddr())) {
            reject(response, ErrorCode.UNAUTHORIZED);
            return;
        }
        if (!keyMatches(request.getHeader(AiServiceProperties.INTERNAL_KEY_HEADER))) {
            reject(response, ErrorCode.UNAUTHENTICATED);
            return;
        }

        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                "music-ai", null, AuthorityUtils.createAuthorityList("ROLE_INTERNAL")));
        SecurityContextHolder.setContext(context);
        try {
            filterChain.doFilter(request, response);
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    /** So sánh hằng thời gian để không lộ khóa qua thời gian phản hồi. Khóa cấu hình rỗng thì từ chối tất cả. */
    private boolean keyMatches(String provided) {
        String expected = properties.getInternalKey();
        if (provided == null || expected == null || expected.isBlank()) {
            return false;
        }
        return MessageDigest.isEqual(
                provided.getBytes(StandardCharsets.UTF_8), expected.getBytes(StandardCharsets.UTF_8));
    }

    /** Chấp nhận loopback, mạng riêng (10.x, 172.16-31.x, 192.168.x), link-local và IPv6 ULA (fc00::/7). */
    static boolean isInternalAddress(String remoteAddr) {
        if (remoteAddr == null) {
            return false;
        }
        try {
            InetAddress address = InetAddress.getByName(remoteAddr);
            if (address.isLoopbackAddress() || address.isSiteLocalAddress() || address.isLinkLocalAddress()) {
                return true;
            }
            return address instanceof Inet6Address && (address.getAddress()[0] & 0xFE) == 0xFC;
        } catch (UnknownHostException e) {
            return false;
        }
    }

    private void reject(HttpServletResponse response, ErrorCode errorCode) throws IOException {
        response.setStatus(errorCode.getHttpStatusCode().value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        objectMapper.writeValue(
                response.getWriter(),
                ApiResponse.builder()
                        .code(errorCode.getCode())
                        .message(errorCode.getMessage())
                        .build());
    }
}
