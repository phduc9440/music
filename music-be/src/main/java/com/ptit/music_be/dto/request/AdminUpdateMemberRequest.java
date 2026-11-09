package com.ptit.music_be.dto.request;

import java.util.Set;

import com.ptit.music_be.dto.enums.MemberStatus;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** PATCH: trường nào null thì giữ nguyên. roles là tên role không có prefix, ví dụ "ADMIN", "USER". */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class AdminUpdateMemberRequest {
    MemberStatus status;
    Set<String> roles;
}
