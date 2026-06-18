package com.ptit.music_be.controller;

import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.UserResponse;
import com.ptit.music_be.service.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Users", description = "APIs for user management")
public class UserController {

	UserService userService;

	@GetMapping("/me")
	@Operation(summary = "Get current logged-in user info", security = @SecurityRequirement(name = "bearerAuth"))
	public ApiResponse<UserResponse> getMyInfo() {
		return ApiResponse.<UserResponse>builder()
				.result(userService.getMyInfo())
				.build();
	}
}
