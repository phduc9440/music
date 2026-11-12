package com.ptit.music_be.dto.response.admin;

import java.util.List;

import com.ptit.music_be.dto.enums.auth.AdminPermission;
import lombok.*;
import lombok.experimental.FieldDefaults;

/** Một vai trò tài khoản kèm quyền quản trị và số thành viên đang có vai trò này. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class RoleResponse {
    String id;
    /** Mã vai trò (USER, ADMIN, SUPER_ADMIN hoặc mã sinh từ tên). */
    String name;
    /** Tên hiển thị của vai trò tự tạo; null với vai trò có sẵn. */
    String label;
    String description;
    boolean builtIn;
    /** Quyền chỉnh được trong bảng (false với USER, SUPER_ADMIN). */
    boolean editable;
    long memberCount;
    List<AdminPermission> permissions;
}
