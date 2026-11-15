package com.ptit.music_be.configuration;

import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.ptit.music_be.dto.enums.auth.AdminPermission;
import com.ptit.music_be.dto.enums.auth.AuthProvider;
import com.ptit.music_be.dto.enums.auth.MemberStatus;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.MemberRole;
import com.ptit.music_be.entity.Role;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.auth.MemberRoleRepository;
import com.ptit.music_be.repository.auth.RoleRepository;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;

@Configuration
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Slf4j
public class ApplicationInitConfig {

    /** Tài khoản gốc: SUPER_ADMIN và cũng là chủ sở hữu các bản nhạc của kho bản nhạc mẫu. */
    public static final String ROOT_ADMIN_EMAIL = "admin@music.com";

    PasswordEncoder passwordEncoder;

    @Bean
    @ConditionalOnProperty(
            prefix = "spring",
            value = "datasource.driver-class-name",
            havingValue = "com.mysql.cj.jdbc.Driver")
    ApplicationRunner applicationRunner(
            MemberRepository memberRepository,
            RoleRepository roleRepository,
            MemberRoleRepository memberRoleRepository) {
        return args -> {
            // Seed roles if not present
            Role roleUser = roleRepository
                    .findByName("USER")
                    .orElseGet(() ->
                            roleRepository.save(Role.builder().name("USER").build()));

            // DB chưa chạy seed V2: tạo ADMIN kèm quyền mặc định (giống seed)
            Role roleAdmin = roleRepository
                    .findByName("ADMIN")
                    .orElseGet(() -> roleRepository.save(Role.builder()
                            .name("ADMIN")
                            .permissions(AdminPermission.adminDefaults())
                            .build()));

            Role roleSuperAdmin = roleRepository
                    .findByName("SUPER_ADMIN")
                    .orElseGet(() -> roleRepository.save(
                            Role.builder().name("SUPER_ADMIN").build()));

            // Seed default admin if not present
            if (memberRepository.findByEmail(ROOT_ADMIN_EMAIL).isEmpty()) {
                Member admin = Member.builder()
                        .email(ROOT_ADMIN_EMAIL)
                        .passwordHash(passwordEncoder.encode("12345678"))
                        .status(MemberStatus.ACTIVE)
                        .emailVerified(true)
                        .authProvider(AuthProvider.LOCAL)
                        .build();

                Member savedAdmin = memberRepository.save(admin);

                MemberRole memberRole =
                        MemberRole.builder().member(savedAdmin).role(roleAdmin).build();

                memberRoleRepository.save(memberRole);

                log.warn(
                        "Admin user created with email: admin@music.com and default password: 12345678, please change it!");
            }

            // Tài khoản gốc luôn là SUPER_ADMIN (cũng áp dụng cho DB đã có sẵn admin@music.com từ trước)
            memberRepository.findByEmail(ROOT_ADMIN_EMAIL).ifPresent(root -> {
                boolean has = memberRoleRepository.existsByMemberAndRole(root, roleSuperAdmin);
                if (!has) {
                    memberRoleRepository.save(MemberRole.builder()
                            .member(root)
                            .role(roleSuperAdmin)
                            .build());
                }
            });
        };
    }
}
