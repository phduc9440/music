package com.ptit.music_be.dto.response;

import com.ptit.music_be.dto.enums.AuthProvider;
import com.ptit.music_be.dto.enums.Role;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.experimental.SuperBuilder;

@Data
@SuperBuilder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class MemberResponse {

	String id;
	String username;
	String email;
	String phone;
	String fullName;
	Role role;
	AuthProvider authProvider;
}
