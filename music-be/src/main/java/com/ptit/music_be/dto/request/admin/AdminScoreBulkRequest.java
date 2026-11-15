package com.ptit.music_be.dto.request.admin;

import java.util.List;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import com.ptit.music_be.dto.enums.admin.ScoreBulkAction;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;

/** ADMIN áp một thao tác lên nhiều bản nhạc (tối đa 100). reason dùng cho PRIVATE và DELETE (gửi cho chủ). */
@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class AdminScoreBulkRequest {
    @NotEmpty(message = "INVALID_REQUEST")
    @Size(max = 100, message = "INVALID_REQUEST")
    List<String> ids;

    @NotNull(message = "INVALID_REQUEST")
    ScoreBulkAction action;

    @Size(max = 255, message = "INVALID_REQUEST")
    String reason;
}
