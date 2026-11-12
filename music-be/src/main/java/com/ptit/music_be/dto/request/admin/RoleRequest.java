package com.ptit.music_be.dto.request.admin;

import java.util.List;

import com.ptit.music_be.dto.enums.auth.AdminPermission;
import lombok.*;
import lombok.experimental.FieldDefaults;

/** Tạo / sửa vai trò: tên hiển thị, mô tả và toàn bộ quyền quản trị được bật (quyền phải có kèm được tự bật thêm). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class RoleRequest {
    String label;
    String description;
    List<AdminPermission> permissions;
}
