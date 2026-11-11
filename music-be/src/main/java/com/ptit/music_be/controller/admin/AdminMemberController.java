package com.ptit.music_be.controller.admin;

import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.request.AdminUpdateMemberRequest;
import com.ptit.music_be.dto.response.AdminMemberDetailResponse;
import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.MemberResponse;
import com.ptit.music_be.dto.response.PageResponse;
import com.ptit.music_be.service.admin.AdminMemberService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/admin/members")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Admin - Members", description = "Chỉ ROLE_ADMIN: quản lý thành viên")
public class AdminMemberController {

    AdminMemberService adminMemberService;

    @GetMapping
    @Operation(
            summary = "Danh sách thành viên (phân trang, tìm theo email/tên)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PageResponse<MemberResponse>> getMembers(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword) {
        return ApiResponse.<PageResponse<MemberResponse>>builder()
                .result(adminMemberService.getMembers(page, size, keyword))
                .build();
    }

    @GetMapping("/plain-admins")
    @Operation(
            summary = "Danh sách quản trị viên thường (ADMIN, không phải SUPER_ADMIN) kèm gói đang dùng",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PageResponse<MemberResponse>> getPlainAdmins(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword) {
        return ApiResponse.<PageResponse<MemberResponse>>builder()
                .result(adminMemberService.getPlainAdmins(page, size, keyword))
                .build();
    }

    @GetMapping("/{memberId}")
    @Operation(summary = "Chi tiết thành viên", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<MemberResponse> getMember(@PathVariable String memberId) {
        return ApiResponse.<MemberResponse>builder()
                .result(adminMemberService.getMember(memberId))
                .build();
    }

    @GetMapping("/{memberId}/detail")
    @Operation(
            summary = "Chi tiết thành viên kèm số liệu hoạt động và bản nhạc gần đây",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<AdminMemberDetailResponse> getMemberDetail(@PathVariable String memberId) {
        return ApiResponse.<AdminMemberDetailResponse>builder()
                .result(adminMemberService.getMemberDetail(memberId))
                .build();
    }

    @PatchMapping("/{memberId}")
    @Operation(
            summary = "Khóa/mở khóa (status) và đổi vai trò (roles)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<MemberResponse> updateMember(
            @PathVariable String memberId, @RequestBody AdminUpdateMemberRequest request) {
        return ApiResponse.<MemberResponse>builder()
                .result(adminMemberService.updateMember(memberId, request))
                .build();
    }
}
