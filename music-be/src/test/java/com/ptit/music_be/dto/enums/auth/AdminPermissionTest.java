package com.ptit.music_be.dto.enums.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;

import org.junit.jupiter.api.Test;

/** Quyền tạo tài khoản: ban đầu chỉ SUPER_ADMIN có, SUPER_ADMIN tích cho vai trò khác ở trang Phân quyền. */
class AdminPermissionTest {

    @Test
    void createMembersIsNotAnAdminDefault() {
        assertThat(AdminPermission.adminDefaults()).doesNotContain(AdminPermission.MEMBERS_CREATE);
    }

    @Test
    void createMembersNeedsViewMembersAndSitsInUsersSection() {
        assertThat(AdminPermission.MEMBERS_CREATE.requires()).containsExactly(AdminPermission.MEMBERS_VIEW);
        assertThat(AdminPermission.MEMBERS_CREATE.section()).isEqualTo("users");
        assertThat(AdminPermission.withRequired(Set.of(AdminPermission.MEMBERS_CREATE)))
                .containsExactlyInAnyOrder(AdminPermission.MEMBERS_CREATE, AdminPermission.MEMBERS_VIEW);
    }
}
