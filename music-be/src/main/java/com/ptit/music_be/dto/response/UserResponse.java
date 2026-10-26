package com.ptit.music_be.dto.response;

import java.util.Set;

import com.ptit.music_be.dto.enums.AuthProvider;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class UserResponse {

    String id;
    String email;
    String status;
    Boolean emailVerified;
    AuthProvider authProvider;
    Set<String> roles;
}
