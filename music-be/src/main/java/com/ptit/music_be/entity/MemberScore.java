package com.ptit.music_be.entity;

import jakarta.persistence.*;

import com.ptit.music_be.converter.SharePermissionConverter;
import com.ptit.music_be.dto.enums.SharePermission;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Entity
@Table(
        name = "member_scores",
        uniqueConstraints = {@UniqueConstraint(columnNames = {"member_id", "score_id"})})
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class MemberScore {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", nullable = false)
    Member member;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "score_id", nullable = false)
    Score score;

    @Convert(converter = SharePermissionConverter.class)
    @Column(name = "permission")
    SharePermission permission;
}
