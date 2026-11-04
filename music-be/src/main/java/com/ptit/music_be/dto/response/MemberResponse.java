package com.ptit.music_be.dto.response;

import java.util.Set;

import com.ptit.music_be.dto.enums.AuthProvider;
import com.ptit.music_be.dto.enums.MemberStatus;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class MemberResponse {

    String id;
    String email;
    String fullName;
    String phone;
    String address;
    String avatarUrl;
    MemberStatus status;
    Boolean emailVerified;
    AuthProvider authProvider;
    Set<String> roles;
}
