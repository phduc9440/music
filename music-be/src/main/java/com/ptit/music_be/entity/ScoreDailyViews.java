package com.ptit.music_be.entity;

import java.time.LocalDate;

import jakarta.persistence.*;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Lượt xem của một bản nhạc trong một ngày (bảng score_daily_views); chỉ để đọc, việc ghi dùng câu UPSERT. */
@Entity
@Table(name = "score_daily_views")
@IdClass(ScoreDailyViews.Key.class)
@Getter
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ScoreDailyViews {

    @Id
    @Column(name = "score_id", length = 36)
    String scoreId;

    @Id
    @Column(name = "view_date")
    LocalDate viewDate;

    @Column(nullable = false)
    int views;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Key implements java.io.Serializable {
        String scoreId;
        LocalDate viewDate;
    }
}
