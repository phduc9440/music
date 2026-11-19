package com.ptit.music_be.configuration;

import java.util.ArrayList;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Các origin được gọi API (CORS) và mở WebSocket, dùng chung cho {@link CorsConfig} và {@code WebSocketConfig}.
 *
 * <p>Đọc {@code app.cors.allowed-origins} (danh sách cách nhau bởi dấu phẩy, mặc định là hai máy dev) và luôn thêm
 * {@code app.web-url} (biến môi trường {@code APP_WEB_URL}), nên khi deploy chỉ cần đặt địa chỉ web là đủ.
 */
@Component
public class AllowedOrigins {

    public static final String DEFAULT = "http://localhost:5173,http://localhost:3000";

    private final List<String> origins;

    public AllowedOrigins(
            @Value("${app.cors.allowed-origins:" + DEFAULT + "}") String configured,
            @Value("${app.web-url:}") String webUrl) {
        List<String> list = new ArrayList<>();
        for (String raw : (configured == null ? "" : configured).split(",")) {
            add(list, raw);
        }
        add(list, webUrl);
        this.origins = List.copyOf(list);
    }

    private static void add(List<String> list, String raw) {
        if (raw == null || raw.isBlank()) {
            return;
        }
        String origin = raw.strip();
        while (origin.endsWith("/")) {
            origin = origin.substring(0, origin.length() - 1);
        }
        if (!origin.isEmpty() && !list.contains(origin)) {
            list.add(origin);
        }
    }

    public List<String> list() {
        return origins;
    }

    public String[] array() {
        return origins.toArray(String[]::new);
    }
}
