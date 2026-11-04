package com.ptit.music_be.configuration;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class AuthRateLimitFilterTest {

    private int post(AuthRateLimitFilter filter, String path, String ip) throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", path);
        req.setRemoteAddr(ip);
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter.doFilter(req, res, new MockFilterChain());
        return res.getStatus();
    }

    @Test
    void blocksAfterLimitPerIpAndPath() throws Exception {
        AuthRateLimitFilter filter = new AuthRateLimitFilter();
        for (int i = 0; i < 10; i++) assertEquals(200, post(filter, "/api/auth/login", "1.1.1.1"));
        assertEquals(429, post(filter, "/api/auth/login", "1.1.1.1"));
        assertEquals(200, post(filter, "/api/auth/login", "2.2.2.2"));
        assertEquals(200, post(filter, "/api/auth/register", "1.1.1.1"));
    }

    @Test
    void ignoresNonAuthRequests() throws Exception {
        AuthRateLimitFilter filter = new AuthRateLimitFilter();
        for (int i = 0; i < 50; i++) assertEquals(200, post(filter, "/api/scores", "1.1.1.1"));
    }
}
