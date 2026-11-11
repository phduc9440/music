package com.ptit.music_be.entity;

import jakarta.persistence.*;

import com.ptit.music_be.dto.enums.UsageMetric;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Số đã dùng của một chỉ số trong một tháng (period = yyyy-MM). */
@Entity
@Table(name = "usage_counters")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class UsageCounter {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @Column(name = "member_id", nullable = false, length = 36)
    String memberId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    UsageMetric metric;

    @Column(nullable = false, length = 7)
    String period;

    @Column(nullable = false)
    int used;
}
