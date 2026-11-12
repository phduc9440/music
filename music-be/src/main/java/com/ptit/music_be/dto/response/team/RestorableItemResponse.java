package com.ptit.music_be.dto.response.team;

import java.time.LocalDateTime;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Team hoặc show đã xóa mềm, còn khôi phục được (danh sách "đã xóa" của chủ team / quản lý team). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class RestorableItemResponse {
    String id;
    String name;
    /** Mô tả của team hoặc địa điểm của show. */
    String description;
    LocalDateTime deletedAt;
    String deletedByName;
    /** Hạn cuối khôi phục (30 ngày sau lúc xóa). */
    LocalDateTime restorableUntil;
}
