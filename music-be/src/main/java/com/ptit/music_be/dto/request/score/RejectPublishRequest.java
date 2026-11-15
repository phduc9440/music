package com.ptit.music_be.dto.request.score;

import jakarta.validation.constraints.Size;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;

/** ADMIN từ chối công khai một bản nhạc, có thể kèm lý do. */
@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class RejectPublishRequest {
    @Size(max = 255, message = "INVALID_REQUEST")
    String reason;
}
