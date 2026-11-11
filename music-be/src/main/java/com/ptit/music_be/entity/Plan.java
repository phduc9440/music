package com.ptit.music_be.entity;

import jakarta.persistence.*;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Gói dịch vụ (FREE / PRO / TEAM). Hạn mức nằm trong cột JSON {@code limits}, đọc qua PlanLimits. */
@Entity
@Table(name = "plans")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class Plan {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @Column(nullable = false, unique = true, length = 16)
    String code;

    @Column(nullable = false, length = 100)
    String name;

    @Column(name = "price_month", nullable = false)
    long priceMonth;

    @Column(name = "price_year", nullable = false)
    long priceYear;

    @Column(name = "limits", nullable = false, columnDefinition = "JSON")
    String limits;

    @Column(name = "sort_order", nullable = false)
    int sortOrder;
}
