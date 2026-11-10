package com.ptit.music_be.dto.response;

import java.time.LocalDateTime;
import java.util.Set;

import com.ptit.music_be.dto.enums.AuthProvider;
import com.ptit.music_be.dto.enums.MemberStatus;
import com.ptit.music_be.dto.enums.UiTheme;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class MemberResponse {

    String id;
    String email;
    String fullName;
    String phone;
    String address;
    String avatarUrl;
    /** Giao diện đã chọn; null là chưa chọn (theo hệ thống). */
    UiTheme uiTheme;
    MemberStatus status;
    Boolean emailVerified;
    AuthProvider authProvider;
    Set<String> roles;
    LocalDateTime createdAt;
    LocalDateTime lastLoginAt;
}
