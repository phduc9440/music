package com.ptit.music_be.dto.request;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class RefreshRequest {

    /** Tuỳ chọn: web gửi qua cookie HttpOnly, mobile gửi trong body. */
    String refreshToken;
}
