package com.ptit.music_be.dto.response.team;

import java.time.LocalDateTime;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Một bản nhạc trong team (tab Bản nhạc) hoặc bản cá nhân để chọn chuyển vào team. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class TeamScoreResponse {
    String id;
    String title;
    String composer;
    String ownerId;
    String ownerName;
    Integer measureCount;
    String difficulty;
    LocalDateTime updatedAt;
    /** Người đang xem gỡ được bản này khỏi team (chủ bản nhạc hoặc quản lý team). */
    boolean canRemove;
}
