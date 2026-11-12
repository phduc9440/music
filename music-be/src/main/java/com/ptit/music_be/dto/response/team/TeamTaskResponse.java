package com.ptit.music_be.dto.response.team;

import java.time.LocalDate;

import com.ptit.music_be.dto.enums.team.ShowItemStatus;
import lombok.*;
import lombok.experimental.FieldDefaults;

/** Việc của tôi trong Show: bài tôi phối hoặc duyệt, chưa xong. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class TeamTaskResponse {
    String itemId;
    String showId;
    String showName;
    LocalDate showDate;
    String teamId;
    String teamName;
    String scoreId;
    String scoreTitle;
    ShowItemStatus status;
    LocalDate dueDate;
    boolean asArranger;
    boolean asReviewer;
}
