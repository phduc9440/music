package com.ptit.music_be.dto.response;

import java.util.List;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Trạng thái chia sẻ của một bản nhạc (chỉ chủ sở hữu hoặc ADMIN xem được). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ScoreSharingResponse {
    /** PRIVATE / PENDING / PUBLIC (xem Visibility). */
    String visibility;
    List<ShareMemberResponse> members;
    /** Số yêu cầu xin quyền đang chờ duyệt. */
    long pendingRequests;
}
