package com.ptit.music_be.websocket;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

import jakarta.servlet.http.Cookie;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.http.server.ServletServerHttpResponse;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.web.socket.WebSocketHandler;

import com.ptit.music_be.configuration.CustomJwtDecoder;

/** Bắt tay WebSocket dùng đúng access token của API: cookie hoặc header, token hỏng/bị thu hồi thì 401. */
class WebSocketAuthHandshakeTest {

    private final CustomJwtDecoder decoder = mock(CustomJwtDecoder.class);
    private final WebSocketAuthHandshake handshake = new WebSocketAuthHandshake(decoder);
    private final WebSocketHandler handler = mock(WebSocketHandler.class);

    private static Jwt jwt(String subject) {
        return Jwt.withTokenValue("t")
                .header("alg", "HS512")
                .subject(subject)
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(60))
                .build();
    }

    private boolean run(MockHttpServletRequest req, MockHttpServletResponse res, Map<String, Object> attrs) {
        return handshake.beforeHandshake(
                new ServletServerHttpRequest(req), new ServletServerHttpResponse(res), handler, attrs);
    }

    @Test
    void cookieTokenIsAcceptedAndPrincipalIsTheEmail() {
        when(decoder.decode("good")).thenReturn(jwt("a@x.com"));
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setCookies(new Cookie("access_token", "good"));
        Map<String, Object> attrs = new HashMap<>();

        assertTrue(run(req, new MockHttpServletResponse(), attrs));

        assertEquals("a@x.com", attrs.get("email"));
        assertEquals(
                "a@x.com",
                handshake
                        .determineUser(new ServletServerHttpRequest(req), handler, attrs)
                        .getName());
    }

    @Test
    void bearerHeaderIsAccepted() {
        when(decoder.decode("good")).thenReturn(jwt("b@x.com"));
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.addHeader("Authorization", "Bearer good");

        assertTrue(run(req, new MockHttpServletResponse(), new HashMap<>()));
    }

    @Test
    void missingTokenIsRejectedWith401() {
        MockHttpServletResponse res = new MockHttpServletResponse();

        assertFalse(run(new MockHttpServletRequest(), res, new HashMap<>()));
        assertEquals(HttpStatus.UNAUTHORIZED.value(), res.getStatus());
    }

    @Test
    void revokedOrInvalidTokenIsRejectedWith401() {
        when(decoder.decode(anyString())).thenThrow(new JwtException("Token revoked"));
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setCookies(new Cookie("access_token", "bad"));
        MockHttpServletResponse res = new MockHttpServletResponse();

        assertFalse(run(req, res, new HashMap<>()));
        assertEquals(HttpStatus.UNAUTHORIZED.value(), res.getStatus());
    }

    @Test
    void noEmailMeansNoPrincipal() {
        assertNull(handshake.determineUser(
                new ServletServerHttpRequest(new MockHttpServletRequest()), handler, new HashMap<>()));
    }
}
