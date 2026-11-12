package com.ptit.music_be.dto.response.admin;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class AnnouncementResponse {
    /** Số người đã nhận (không tính người gửi). */
    int recipients;
}
