package com.ptit.music_be.service;

import java.io.InputStream;
import java.nio.file.Path;

import org.springframework.core.io.Resource;

/** Abstraction over where binary files live (local folder now, MinIO/S3 later). */
public interface FileStorageService {

    /**
     * Stores the stream at the given relative path (e.g. scores/{id}/original/1-abc.pdf) and returns the
     * normalized relative path that should be saved to the database.
     */
    String store(InputStream inputStream, String relativePath);

    Resource loadAsResource(String relativePath);

    /** Absolute path on disk, used when another process (AI service, MuseScore CLI) must read the file. */
    Path resolve(String relativePath);

    void delete(String relativePath);

    /** Deletes a directory (relative to the storage root) and everything inside it. */
    void deleteDirectory(String relativeDir);
}
