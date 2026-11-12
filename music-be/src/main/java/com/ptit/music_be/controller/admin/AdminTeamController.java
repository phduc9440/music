package com.ptit.music_be.controller.admin;

import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.response.AdminTeamDetailResponse;
import com.ptit.music_be.dto.response.AdminTeamResponse;
import com.ptit.music_be.dto.response.AdminTeamSummaryResponse;
import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.PageResponse;
import com.ptit.music_be.service.admin.AdminTeamService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/admin/teams")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Admin - Teams", description = "Chỉ ROLE_ADMIN: xem và xử lý Team và Show (mục 4.1)")
public class AdminTeamController {

    AdminTeamService adminTeamService;

    @GetMapping("/summary")
    @Operation(summary = "Teams, active teams (7 days), members in teams, preparing shows, open/overdue items", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<AdminTeamSummaryResponse> summary() {
        return ApiResponse.<AdminTeamSummaryResponse>builder()
                .result(adminTeamService.summary())
                .build();
    }

    @GetMapping
    @Operation(summary = "Search teams by name or creator; deleted=true lists soft-deleted teams", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PageResponse<AdminTeamResponse>> search(
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "false") boolean deleted,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.<PageResponse<AdminTeamResponse>>builder()
                .result(adminTeamService.search(keyword, deleted, page, size))
                .build();
    }

    @GetMapping("/{id}")
    @Operation(summary = "Team detail: members, shows, score titles, recent activity", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<AdminTeamDetailResponse> detail(@PathVariable String id) {
        return ApiResponse.<AdminTeamDetailResponse>builder()
                .result(adminTeamService.detail(id))
                .build();
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Soft-delete a team (violation); restorable for 30 days; members are notified with the reason", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> delete(@PathVariable String id, @RequestParam(required = false) String reason) {
        adminTeamService.delete(id, reason);
        return ApiResponse.<Void>builder().build();
    }

    @PostMapping("/{id}/restore")
    @Operation(summary = "Restore a soft-deleted team within 30 days; 3818 expired", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> restore(@PathVariable String id) {
        adminTeamService.restore(id);
        return ApiResponse.<Void>builder().build();
    }
}
