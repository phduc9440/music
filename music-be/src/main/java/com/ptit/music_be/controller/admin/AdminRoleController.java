package com.ptit.music_be.controller.admin;

import java.util.List;

import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.request.admin.RoleRequest;
import com.ptit.music_be.dto.response.admin.RoleResponse;
import com.ptit.music_be.dto.response.common.ApiResponse;
import com.ptit.music_be.service.admin.RoleService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/admin/roles")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Admin - Roles", description = "Chỉ SUPER_ADMIN: thêm, sửa, xóa vai trò tài khoản và tích quyền quản trị")
public class AdminRoleController {

    RoleService roleService;

    private static <T> ApiResponse<T> ok(T result) {
        return ApiResponse.<T>builder().result(result).build();
    }

    @GetMapping
    @Operation(
            summary = "All roles with permissions and member counts",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<RoleResponse>> list() {
        return ok(roleService.list());
    }

    @PostMapping
    @Operation(
            summary = "Create a role (code generated from the label)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<RoleResponse> create(@RequestBody RoleRequest request) {
        return ok(roleService.create(request));
    }

    @PutMapping("/{id}")
    @Operation(
            summary =
                    "Edit a role: label, description, permissions (ADMIN: permissions only; USER, SUPER_ADMIN: locked)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<RoleResponse> update(@PathVariable String id, @RequestBody RoleRequest request) {
        return ok(roleService.update(id, request));
    }

    @DeleteMapping("/{id}")
    @Operation(
            summary = "Delete a custom role nobody holds (1021 if in use)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> delete(@PathVariable String id) {
        roleService.delete(id);
        return ApiResponse.<Void>builder().build();
    }
}
