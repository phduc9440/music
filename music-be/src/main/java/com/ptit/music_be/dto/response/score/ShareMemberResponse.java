package com.ptit.music_be.dto.response.score;

import com.ptit.music_be.dto.enums.score.SharePermission;
import com.ptit.music_be.dto.enums.score.ShareSource;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ShareMemberResponse {
    String memberId;
    String email;
    String fullName;
    SharePermission permission;
    /** DIRECT: chủ cấp/duyệt; LINK: vào bằng liên kết. */
    ShareSource source;
}
