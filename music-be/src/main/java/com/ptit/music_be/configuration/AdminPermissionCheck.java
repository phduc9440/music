package com.ptit.music_be.configuration;

import org.springframework.stereotype.Component;

import com.ptit.music_be.dto.enums.auth.AdminPermission;
import com.ptit.music_be.utils.SecurityUtils;

/**
 * Dùng trong {@code @PreAuthorize}: {@code @PreAuthorize("@perm.has('MEMBERS_VIEW')")}. Quyền tính theo vai trò hiện tại và
 * bảng quyền của vai trò (RolePermissionRegistry), không phải authority ghi sẵn, nên test chỉ cần đặt ROLE_ADMIN là đủ.
 */
@Component("perm")
public class AdminPermissionCheck {

    public boolean has(String permission) {
        return SecurityUtils.hasPermission(AdminPermission.valueOf(permission));
    }

    /** Có ít nhất một trong các quyền (tên cách nhau bởi dấu phẩy). */
    public boolean any(String permissions) {
        for (String p : permissions.split(",")) {
            if (SecurityUtils.hasPermission(AdminPermission.valueOf(p.trim()))) {
                return true;
            }
        }
        return false;
    }

    public boolean superAdmin() {
        return SecurityUtils.isSuperAdmin();
    }
}
