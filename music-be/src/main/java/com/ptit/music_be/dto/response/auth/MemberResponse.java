package com.ptit.music_be.dto.response.auth;

import java.time.LocalDateTime;
import java.util.Set;

import com.ptit.music_be.dto.enums.auth.AdminPermission;
import com.ptit.music_be.dto.enums.auth.AppLocale;
import com.ptit.music_be.dto.enums.auth.AuthProvider;
import com.ptit.music_be.dto.enums.auth.MemberStatus;
import com.ptit.music_be.dto.enums.auth.UiTheme;
import com.ptit.music_be.dto.response.billing.MemberPlanSummary;

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
    /** Ngôn ngữ đã chọn; null là chưa chọn (tiếng Việt). */
    AppLocale locale;

    MemberStatus status;
    Boolean emailVerified;
    AuthProvider authProvider;
    Set<String> roles;
    /** Quyền quản trị suy ra từ vai trò (web ẩn / hiện menu và nút); rỗng với tài khoản thường. */
    Set<AdminPermission> permissions;

    LocalDateTime createdAt;
    LocalDateTime lastLoginAt;
    /** Gói đang dùng; chỉ có ở danh sách thành viên khu quản trị, null ở chỗ khác. */
    MemberPlanSummary plan;
}
