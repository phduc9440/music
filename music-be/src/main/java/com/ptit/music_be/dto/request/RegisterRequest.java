package com.ptit.music_be.dto.request;

import jakarta.validation.constraints.Size;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;

@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class RegisterRequest {

	@Size(min = 3, message = "USERNAME_INVALID")
	String username;

	@Size(min = 6, message = "PASSWORD_INVALID")
	String password;

	String email;
	String phone;
	String fullName;
	String address;
}
