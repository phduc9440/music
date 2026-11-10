package com.ptit.music_be.service.storage.impl;

import java.io.IOException;
import java.io.InputStream;
import java.net.MalformedURLException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Comparator;
import java.util.stream.Stream;

import jakarta.annotation.PostConstruct;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.stereotype.Service;

import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.service.storage.FileStorageService;

import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class LocalFileStorageService implements FileStorageService {

    private final Path rootLocation;

    public LocalFileStorageService(@Value("${app.storage.local-root:./storage}") String localRoot) {
        this.rootLocation = Paths.get(localRoot).toAbsolutePath().normalize();
    }

    @PostConstruct
    void init() {
        try {
            Files.createDirectories(rootLocation);
            log.info("Local file storage root: {}", rootLocation);
        } catch (IOException e) {
            throw new IllegalStateException("Could not create storage root " + rootLocation, e);
        }
    }

    @Override
    public String store(InputStream inputStream, String relativePath) {
        Path target = resolve(relativePath);
        try {
            Files.createDirectories(target.getParent());
            Files.copy(inputStream, target, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            log.error("Failed to store file {}", target, e);
            throw new AppException(ErrorCode.FILE_STORAGE_ERROR);
        }
        return rootLocation.relativize(target).toString().replace('\\', '/');
    }

    @Override
    public Resource loadAsResource(String relativePath) {
        Path file = resolve(relativePath);
        if (!Files.isReadable(file)) {
            throw new AppException(ErrorCode.FILE_NOT_EXISTED);
        }
        try {
            return new UrlResource(file.toUri());
        } catch (MalformedURLException e) {
            throw new AppException(ErrorCode.FILE_NOT_EXISTED);
        }
    }

    @Override
    public Path resolve(String relativePath) {
        Path resolved = rootLocation.resolve(relativePath).normalize();
        // Block path traversal such as "../../etc/passwd"
        if (!resolved.startsWith(rootLocation)) {
            throw new AppException(ErrorCode.FILE_STORAGE_ERROR);
        }
        return resolved;
    }

    @Override
    public void delete(String relativePath) {
        try {
            Files.deleteIfExists(resolve(relativePath));
        } catch (IOException e) {
            log.warn("Could not delete file {}", relativePath, e);
        }
    }

    @Override
    public void deleteDirectory(String relativeDir) {
        Path dir = resolve(relativeDir);
        if (!Files.exists(dir) || dir.equals(rootLocation)) {
            return;
        }
        try (Stream<Path> walk = Files.walk(dir)) {
            walk.sorted(Comparator.reverseOrder()).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException e) {
                    log.warn("Could not delete {}", p, e);
                }
            });
        } catch (IOException e) {
            log.warn("Could not delete directory {}", relativeDir, e);
        }
    }
}
