package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import org.hibernate.annotations.CreationTimestamp;

import com.ptit.music_be.event.RewardReason;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Một lần cộng điểm thưởng (X-02, mục 7.5); (reason, refId) duy nhất. */
@Entity
@Table(name = "points_ledger")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class PointsLedgerEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @Column(name = "member_id", nullable = false, length = 36)
    String memberId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    RewardReason reason;

    @Column(name = "ref_id", nullable = false, length = 36)
    String refId;

    @Column(nullable = false)
    int xp;

    @Column(nullable = false)
    int notes;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    LocalDateTime createdAt;
}
