package com.ptit.music_be.dto.request.admin;

import java.util.List;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import com.ptit.music_be.dto.enums.admin.AnnouncementAudience;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;

/** ADMIN gửi một thông báo chung (hiện ở chuông thông báo của người nhận). */
@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class AnnouncementRequest {
    @NotBlank(message = "INVALID_REQUEST")
    @Size(max = 500, message = "INVALID_REQUEST")
    String message;

    @NotNull(message = "INVALID_REQUEST")
    AnnouncementAudience audience;

    /** Chỉ dùng khi audience = SELECTED: id các thành viên được chọn (tối đa 200). */
    @Size(max = 200, message = "INVALID_REQUEST")
    List<String> memberIds;
}
