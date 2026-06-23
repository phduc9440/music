package com.ptit.music_be.configuration;

import com.ptit.music_be.dto.enums.Role;
import com.ptit.music_be.entity.Admin;
import com.ptit.music_be.repository.AdminRepository;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Slf4j
public class ApplicationInitConfig {

	PasswordEncoder passwordEncoder;

	@Bean
	@ConditionalOnProperty(prefix = "spring", value = "datasource.driver-class-name", havingValue = "com.mysql.cj.jdbc.Driver")
	ApplicationRunner applicationRunner(AdminRepository adminRepository) {
		return args -> {
			if (adminRepository.findByUsername("admin").isEmpty()) {

				Admin admin = Admin.builder()
						.username("admin")
						.password(passwordEncoder.encode("12345678"))
						.role(Role.ADMIN)
						.position("SUPER_ADMIN")
						.build();

				adminRepository.save(admin);

				log.warn("Admin user created with default password: 12345678, please change it!");
			}
		};
	}
}
