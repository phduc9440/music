package com.ptit.music_be.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.entity.Tag;

@Repository
public interface TagRepository extends JpaRepository<Tag, String> {

    Optional<Tag> findByName(String name);

    Optional<Tag> findBySlug(String slug);

    boolean existsByName(String name);

    boolean existsBySlug(String slug);
}
