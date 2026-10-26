package com.ptit.music_be.configuration;

import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.ptit.music_be.dto.enums.AuthProvider;
import com.ptit.music_be.entity.Role;
import com.ptit.music_be.entity.User;
import com.ptit.music_be.entity.UserRole;
import com.ptit.music_be.repository.RoleRepository;
import com.ptit.music_be.repository.UserRepository;
import com.ptit.music_be.repository.UserRoleRepository;

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
            UserRepository userRepository,
            RoleRepository roleRepository,
            UserRoleRepository userRoleRepository) {
        return args -> {
            // Seed roles if not present
            Role roleUser = roleRepository.findByName("USER")
                    .orElseGet(() -> roleRepository.save(Role.builder().name("USER").build()));

            Role roleAdmin = roleRepository.findByName("ADMIN")
                    .orElseGet(() -> roleRepository.save(Role.builder().name("ADMIN").build()));

            // Seed default admin if not present
            if (userRepository.findByEmail("admin@music.com").isEmpty()) {
                User admin = User.builder()
                        .email("admin@music.com")
                        .passwordHash(passwordEncoder.encode("12345678"))
                        .status("ACTIVE")
                        .emailVerified(true)
                        .authProvider(AuthProvider.LOCAL)
                        .build();

                User savedAdmin = userRepository.save(admin);

                UserRole userRole = UserRole.builder()
                        .user(savedAdmin)
                        .role(roleAdmin)
                        .build();

                userRoleRepository.save(userRole);

                log.warn("Admin user created with email: admin@music.com and default password: 12345678, please change it!");
            }
        };
    }
}
