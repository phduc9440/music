package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Nhạc sĩ (mục 5.4). Bản nhạc trỏ tới qua {@code scores.composer_id}, do backend tự gắn theo tên (ComposerMatcher). */
@Entity
@Table(name = "composers")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class Composer {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @Column(nullable = false)
    String name;

    @Column(nullable = false, unique = true, length = 120)
    String slug;

    /** Tên khác, cách nhau bằng dấu phẩy (ví dụ "Bach, J.S. Bach"), dùng để gắn bản nhạc. */
    @Column(length = 500)
    String aliases;

    @Column(name = "birth_year")
    Integer birthYear;

    @Column(name = "death_year")
    Integer deathYear;

    @Column(length = 100)
    String country;

    /** BAROQUE / CLASSICAL / ROMANTIC / MODERN / VIETNAM (xem ComposerPeriod). */
    @Column(length = 16)
    String period;

    @Column(columnDefinition = "TEXT")
    String bio;

    @Column(name = "image_url", length = 1000)
    String imageUrl;

    /** Trang gốc của ảnh (ví dụ trang ảnh trên Wikimedia Commons). */
    @Column(name = "image_source", length = 1000)
    String imageSource;

    /** Giấy phép của ảnh, ví dụ "Public domain", "CC BY-SA 4.0". */
    @Column(name = "image_license", length = 100)
    String imageLicense;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    LocalDateTime updatedAt;
}
