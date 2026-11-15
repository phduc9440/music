package com.ptit.music_be.dto.request.score;

import java.util.List;

import com.ptit.music_be.dto.enums.score.CommentStatus;

import lombok.*;
import lombok.experimental.FieldDefaults;

/**
 * Sửa góp ý: trường nào null thì giữ nguyên. Nội dung và @nhắc tên chỉ người viết sửa được; trạng thái (chỉ góp ý gốc)
 * người viết, chủ bản nhạc hoặc người có quyền sửa đổi được.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ScoreCommentUpdateRequest {
    String content;
    CommentStatus status;
    /** Danh sách @nhắc tên mới (thay hẳn danh sách cũ); chỉ người mới được thêm nhận thông báo. */
    List<String> mentionIds;
}
