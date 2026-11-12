package com.ptit.music_be.repository.auth;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.entity.Role;

@Repository
public interface RoleRepository extends JpaRepository<Role, String> {

    Optional<Role> findByName(String name);

    boolean existsByName(String name);

    boolean existsByLabelIgnoreCase(String label);

    /** Mọi vai trò kèm quyền (bảng quyền ở trang Vai trò và bộ nhớ quyền của RolePermissionRegistry). */
    @Query("select distinct r from Role r left join fetch r.permissions")
    List<Role> findAllWithPermissions();

    /** Số thành viên của từng vai trò: [roleId, count]. Đếm thẳng từ member_roles. */
    @Query("select mr.role.id, count(mr) from MemberRole mr group by mr.role.id")
    List<Object[]> countMembersByRole();
}
