package com.ptit.music_be.entity;

import java.io.Serializable;
import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.FieldDefaults;

/** Một thao tác đã được server nhận trong phiên đồng chỉnh sửa; dùng để phát lại cho client kết nối lại. */
@Entity
@Table(name = "score_live_ops")
@IdClass(ScoreLiveOp.Key.class)
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ScoreLiveOp {

    @Id
    @Column(name = "score_id", nullable = false, length = 36)
    String scoreId;

    @Id
    @Column(name = "seq", nullable = false)
    Long seq;

    @Column(name = "op_id", nullable = false, length = 36)
    String opId;

    @Column(name = "member_id", length = 36)
    String memberId;

    /** JSON của gói phát cho cả phiên (xem {@code LiveMessages.OpBroadcast}). */
    @Column(name = "payload", nullable = false, columnDefinition = "JSON")
    String payload;

    @Column(name = "created_at")
    LocalDateTime createdAt;

    /** Khóa chính ghép (score_id, seq). */
    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @EqualsAndHashCode
    public static class Key implements Serializable {
        private String scoreId;
        private Long seq;
    }
}
