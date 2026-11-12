package com.ptit.music_be.dto.response;

import java.time.LocalDateTime;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ReviewResponse {
    String id;
    String memberId;
    String email;
    String fullName;
    /** 1..5, null nếu chỉ bình luận. */
    Integer rating;

    String comment;
    /** Nhận xét của chính người đang xem (được sửa, xóa). */
    boolean mine;
    /** Người đang xem xóa được không: tác giả nhận xét, chủ sở hữu hoặc ADMIN. */
    boolean canDelete;

    LocalDateTime createdAt;
    LocalDateTime updatedAt;
}
