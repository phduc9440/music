package com.ptit.music_be.configuration;

import jakarta.servlet.MultipartConfigElement;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.MultipartConfigFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.unit.DataSize;

/**
 * Upload limits are configured in code (not application.yaml) because application.yaml is kept local
 * (skip-worktree) in this repository. Override with env vars MAX_FILE_SIZE / MAX_REQUEST_SIZE if needed.
 */
@Configuration
public class FileUploadConfig {

    @Bean
    MultipartConfigElement multipartConfigElement(
            @Value("${MAX_FILE_SIZE:50MB}") String maxFileSize,
            @Value("${MAX_REQUEST_SIZE:200MB}") String maxRequestSize) {
        MultipartConfigFactory factory = new MultipartConfigFactory();
        factory.setMaxFileSize(DataSize.parse(maxFileSize));
        factory.setMaxRequestSize(DataSize.parse(maxRequestSize));
        return factory.createMultipartConfig();
    }
}
