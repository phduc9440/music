package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

import com.ptit.music_be.dto.enums.OfficialRequestStatus;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.FieldDefaults;

/** Lời xin của quản trị viên: đưa bản nhạc công khai của một người dùng vào kho bản nhạc mẫu (chủ đồng ý mới sao chép). */
@Entity
@Table(name = "official_requests")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class OfficialRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "score_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    Score score;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "requested_by", nullable = false)
    Member requestedBy;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id", nullable = false)
    Member owner;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    OfficialRequestStatus status;

    /** Bản sao trong kho mẫu, có khi chủ đã đồng ý. */
    @Column(name = "copy_score_id", length = 36)
    String copyScoreId;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    LocalDateTime createdAt;

    @Column(name = "resolved_at")
    LocalDateTime resolvedAt;
}
