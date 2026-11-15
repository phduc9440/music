package com.ptit.music_be.entity;

import jakarta.persistence.*;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Chuyên mục diễn đàn (mục 5.5). Số chủ đề không lưu mà đếm khi trả về. */
@Entity
@Table(name = "forum_categories")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ForumCategory {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @Column(nullable = false, length = 60, unique = true)
    String slug;

    @Column(nullable = false, length = 100)
    String name;

    @Column(length = 300)
    String description;

    @Column(name = "sort_order", nullable = false)
    int sortOrder;
}
