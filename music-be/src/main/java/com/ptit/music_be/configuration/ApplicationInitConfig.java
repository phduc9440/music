package com.ptit.music_be.configuration;

import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.ptit.music_be.dto.enums.AuthProvider;
import com.ptit.music_be.dto.enums.MemberStatus;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.MemberRole;
import com.ptit.music_be.entity.Role;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.MemberRoleRepository;
import com.ptit.music_be.repository.RoleRepository;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;

@Configuration
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Slf4j
public class ApplicationInitConfig {

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

            Role roleAdmin = roleRepository
                    .findByName("ADMIN")
                    .orElseGet(() ->
                            roleRepository.save(Role.builder().name("ADMIN").build()));

            Role roleSuperAdmin = roleRepository
                    .findByName("SUPER_ADMIN")
                    .orElseGet(() -> roleRepository.save(
                            Role.builder().name("SUPER_ADMIN").build()));

            // Seed default admin if not present
            if (memberRepository.findByEmail("admin@music.com").isEmpty()) {
                Member admin = Member.builder()
                        .email("admin@music.com")
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
            memberRepository.findByEmail("admin@music.com").ifPresent(root -> {
                boolean has = memberRoleRepository.existsByMemberAndRole(root, roleSuperAdmin);
                if (!has) {
                    memberRoleRepository.save(
                            MemberRole.builder().member(root).role(roleSuperAdmin).build());
                }
            });
        };
    }
}
