package com.ptit.music_be.dto.request.admin;

import java.util.List;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;

/** Admin tạo tài khoản: tự đặt mật khẩu ban đầu, gán vai trò (bỏ trống = USER). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class AdminCreateMemberRequest {
    String email;
    /** Mật khẩu ban đầu, ít nhất 8 ký tự; người dùng tự đổi sau nếu muốn. */
    String password;

    String fullName;
    String phone;
    /** Mã vai trò (USER, ADMIN, vai trò tự tạo...). USER luôn được thêm; không nhận SUPER_ADMIN. */
    List<String> roles;
}
