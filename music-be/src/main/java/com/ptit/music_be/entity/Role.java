package com.ptit.music_be.entity;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

import jakarta.persistence.*;

import com.ptit.music_be.dto.enums.auth.AdminPermission;

import lombok.*;
import lombok.experimental.FieldDefaults;

/**
 * Vai trò tài khoản. USER, ADMIN, SUPER_ADMIN có sẵn (không đổi tên, không xóa); SUPER_ADMIN tạo thêm vai trò khác và tích
 * quyền quản trị cho từng vai trò ({@link #permissions}). SUPER_ADMIN luôn đủ quyền, USER không có quyền quản trị.
 */
@Entity
@Table(name = "roles")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class Role {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    public static final String USER = "USER";
    public static final String ADMIN = "ADMIN";
    public static final String SUPER_ADMIN = "SUPER_ADMIN";

    /** Mã vai trò không dấu cách (USER, ADMIN, SUPER_ADMIN hoặc mã sinh từ tên): quyền Spring ROLE_&lt;name&gt;. */
    @Column(nullable = false, unique = true)
    String name;

    /** Tên hiển thị của vai trò tự tạo; vai trò có sẵn để null (web dùng nhãn dịch sẵn). */
    @Column(length = 100)
    String label;

    @Column(length = 255)
    String description;

    /** Quyền quản trị của vai trò (bảng role_permissions). */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "role_permissions", joinColumns = @JoinColumn(name = "role_id"))
    @Enumerated(EnumType.STRING)
    @Column(name = "permission", length = 40, nullable = false)
    @Builder.Default
    Set<AdminPermission> permissions = EnumSet.noneOf(AdminPermission.class);

    @OneToMany(mappedBy = "role", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    List<MemberRole> memberRoles = new ArrayList<>();

    /** USER, ADMIN, SUPER_ADMIN: có sẵn, không đổi tên hay xóa được. */
    public boolean isBuiltIn() {
        return isBuiltIn(name);
    }

    public static boolean isBuiltIn(String name) {
        return USER.equals(name) || ADMIN.equals(name) || SUPER_ADMIN.equals(name);
    }
}
