package com.ptit.music_be.dto.request.auth;

import com.ptit.music_be.dto.enums.auth.AppLocale;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class SendEmailRequest {
    String to;
    String fullName;
    /** Ngôn ngữ của email; null thì tra theo tài khoản của người nhận, rồi tiếng Việt. */
    AppLocale locale;
}
