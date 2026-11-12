package com.ptit.music_be.dto.response;

import java.time.LocalDateTime;
import java.util.Map;

import com.ptit.music_be.dto.enums.TeamActivityType;
import lombok.*;
import lombok.experimental.FieldDefaults;

/** Một dòng hoạt động của team; web dựng câu từ type + params theo ngôn ngữ người đọc. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class TeamActivityResponse {
    String id;
    TeamActivityType type;
    String actorName;
    Map<String, String> params;
    LocalDateTime createdAt;
}
