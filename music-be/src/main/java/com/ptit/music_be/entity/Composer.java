package com.ptit.music_be.entity;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

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

    /**
     * Tên khác (ví dụ "Bach", "J.S. Bach"), dùng để gắn bản nhạc. Bảng riêng {@code composer_aliases}, mỗi dòng một tên
     * (1NF). API vẫn nhận/trả một chuỗi cách nhau bằng dấu phẩy: xem {@link #getAliases()}, {@link #setAliases(String)}.
     */
    @ElementCollection(fetch = FetchType.LAZY)
    @CollectionTable(name = "composer_aliases", joinColumns = @JoinColumn(name = "composer_id"))
    @OrderColumn(name = "position")
    @Column(name = "alias", nullable = false, length = 120)
    @Builder.Default
    List<String> aliasList = new ArrayList<>();

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

    /** Các tên khác nối bằng ", " (null nếu không có), như API và form quản trị dùng. */
    public String getAliases() {
        return aliasList == null || aliasList.isEmpty() ? null : String.join(", ", aliasList);
    }

    /** Thay toàn bộ tên khác bằng chuỗi cách nhau bằng dấu phẩy (đã chuẩn hóa ở service). */
    public void setAliases(String aliases) {
        if (aliasList == null) {
            aliasList = new ArrayList<>();
        }
        aliasList.clear();
        if (aliases != null) {
            Arrays.stream(aliases.split(","))
                    .map(String::trim)
                    .filter(a -> !a.isEmpty())
                    .distinct()
                    .forEach(aliasList::add);
        }
    }
}
