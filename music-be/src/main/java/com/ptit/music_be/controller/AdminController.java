package com.ptit.music_be.controller;

import com.ptit.music_be.dto.request.AccountCreationRequest;
import com.ptit.music_be.dto.request.AccountUpdateRequest;
import com.ptit.music_be.dto.request.PageRequest;

import com.ptit.music_be.dto.response.AdminResponse;
import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.PageResponse;
import com.ptit.music_be.service.AdminService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admins")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Admins", description = "APIs for admin management")
public class AdminController {

	AdminService adminService;

	@GetMapping("/me")
	@Operation(summary = "Get current logged-in admin info", security = @SecurityRequirement(name = "bearerAuth"))
	public ApiResponse<AdminResponse> getMyInfo() {
		return ApiResponse.<AdminResponse>builder()
				.result(adminService.getMyInfo())
				.build();
	}

	@PostMapping("/accounts")
	@Operation(summary = "Create a new account", security = @SecurityRequirement(name = "bearerAuth"))
	public ApiResponse<AdminResponse> createAccount(@RequestBody @Valid AccountCreationRequest request) {
		return ApiResponse.<AdminResponse>builder()
				.result(adminService.createAccount(request))
				.build();
	}

	@GetMapping("/accounts")
	@Operation(summary = "Get all accounts with pagination", security = @SecurityRequirement(name = "bearerAuth"))
	public ApiResponse<PageResponse<AdminResponse>> getAllAccounts(PageRequest request) {
		return ApiResponse.<PageResponse<AdminResponse>>builder()
				.result(adminService.getAllAccounts(request))
				.build();
	}

	@GetMapping("/accounts/{id}")
	@Operation(summary = "Get an account by ID", security = @SecurityRequirement(name = "bearerAuth"))
	public ApiResponse<AdminResponse> getAccount(@PathVariable String id) {
		return ApiResponse.<AdminResponse>builder()
				.result(adminService.getAccount(id))
				.build();
	}

	@PutMapping("/accounts/{id}")
	@Operation(summary = "Update an account", security = @SecurityRequirement(name = "bearerAuth"))
	public ApiResponse<AdminResponse> updateAccount(
			@PathVariable String id, 
			@RequestBody @Valid AccountUpdateRequest request) {
		return ApiResponse.<AdminResponse>builder()
				.result(adminService.updateAccount(id, request))
				.build();
	}

	@DeleteMapping("/accounts/{id}")
	@Operation(summary = "Delete an account", security = @SecurityRequirement(name = "bearerAuth"))
	public ApiResponse<Void> deleteAccount(@PathVariable String id) {
		adminService.deleteAccount(id);
		return ApiResponse.<Void>builder()
				.message("Account deleted successfully")
				.build();
	}
}
