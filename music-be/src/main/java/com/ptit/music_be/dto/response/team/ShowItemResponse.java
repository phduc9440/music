package com.ptit.music_be.dto.response.team;

import java.time.LocalDate;
import java.util.List;

import com.ptit.music_be.dto.enums.team.ShowItemStatus;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Một bài trong show, kèm các trạng thái người đang xem được chuyển sang. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ShowItemResponse {
    String id;
    String scoreId;
    String scoreTitle;
    String scoreComposer;
    int position;
    String arrangerId;
    String arrangerName;
    String reviewerId;
    String reviewerName;
    LocalDate dueDate;
    ShowItemStatus status;
    String notes;
    String reviewNote;
    /** Các trạng thái người đang xem được chuyển bài này sang (theo vai trò và phân công). */
    List<ShowItemStatus> allowedStatuses;
}
