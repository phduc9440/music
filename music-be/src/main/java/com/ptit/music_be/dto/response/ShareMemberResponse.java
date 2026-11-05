package com.ptit.music_be.dto.response;

import com.ptit.music_be.dto.enums.SharePermission;
import com.ptit.music_be.dto.enums.ShareSource;

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
