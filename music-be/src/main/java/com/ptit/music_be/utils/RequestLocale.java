package com.ptit.music_be.utils;

import java.util.Locale;

import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import com.ptit.music_be.dto.enums.auth.AppLocale;

/** Ngôn ngữ của request hiện tại, đọc từ header {@code Accept-Language} mà web gửi (mục 6.2). Mặc định tiếng Việt. */
public final class RequestLocale {

    private RequestLocale() {}

    public static AppLocale resolve() {
        RequestAttributes attributes = RequestContextHolder.getRequestAttributes();
        if (!(attributes instanceof ServletRequestAttributes servlet)) {
            return AppLocale.VI;
        }
        return parse(servlet.getRequest().getHeader("Accept-Language"));
    }

    /** "en", "en-US,en;q=0.9" → EN; thiếu hoặc ngôn ngữ khác → VI. Chỉ xét ngôn ngữ đứng đầu. */
    public static AppLocale parse(String header) {
        if (header == null || header.isBlank()) {
            return AppLocale.VI;
        }
        String first = header.split(",")[0].split(";")[0].trim().toLowerCase(Locale.ROOT);
        return first.equals("en") || first.startsWith("en-") ? AppLocale.EN : AppLocale.VI;
    }
}
