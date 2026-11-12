package com.ptit.music_be.service.admin;

import java.util.List;

import com.ptit.music_be.dto.request.admin.RoleRequest;
import com.ptit.music_be.dto.response.admin.RoleResponse;

/** Quản lý vai trò tài khoản và quyền quản trị của từng vai trò. Chỉ SUPER_ADMIN. */
public interface RoleService {

    List<RoleResponse> list();

    /** Tạo vai trò mới (mã sinh từ tên). */
    RoleResponse create(RoleRequest request);

    /** Sửa vai trò: vai trò tự tạo sửa tên, mô tả, quyền; ADMIN chỉ sửa quyền; USER, SUPER_ADMIN không sửa được. */
    RoleResponse update(String id, RoleRequest request);

    /** Xóa vai trò tự tạo chưa gán cho ai. */
    void delete(String id);
}
