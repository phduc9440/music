package com.ptit.music_be.dto.request;

import java.util.List;

import jakarta.validation.constraints.NotNull;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Danh sách id tag mới của bản nhạc (thay thế toàn bộ tag cũ). Rỗng = gỡ hết tag. */
@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ScoreTagsRequest {
    @NotNull(message = "INVALID_REQUEST")
    List<String> tagIds;
}
