package com.ptit.music_be.dto.request.team;

import com.ptit.music_be.dto.enums.team.ShowItemStatus;
import lombok.*;
import lombok.experimental.FieldDefaults;

/** Đổi trạng thái bài (kéo thả Kanban, Gửi duyệt, Duyệt, Trả lại); note là góp ý khi trả lại. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ShowItemStatusRequest {
    ShowItemStatus status;
    String note;
}
