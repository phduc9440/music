package com.ptit.music_be.controller.team;

import java.util.List;

import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.response.common.ApiResponse;
import com.ptit.music_be.dto.response.team.TeamInvitationPreviewResponse;
import com.ptit.music_be.dto.response.team.TeamInvitationResponse;
import com.ptit.music_be.dto.response.team.TeamResponse;
import com.ptit.music_be.service.team.TeamService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

/** Phía người được mời: xem trước và chấp nhận lời mời (link hoặc lời mời theo email của tài khoản đang đăng nhập). */
@RestController
@RequestMapping("/api/team-invitations")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Team invitations", description = "Người được mời xem và chấp nhận lời mời vào team")
public class TeamInvitationController {

    TeamService teamService;

    @GetMapping("/mine")
    @Operation(summary = "Pending email invitations sent to my email", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<TeamInvitationResponse>> mine() {
        return ApiResponse.<List<TeamInvitationResponse>>builder()
                .result(teamService.myInvitations())
                .build();
    }

    @PostMapping("/mine/{id}/accept")
    @Operation(summary = "Accept an email invitation sent to me", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<TeamResponse> acceptMine(@PathVariable String id) {
        return ApiResponse.<TeamResponse>builder().result(teamService.acceptMine(id)).build();
    }

    @PostMapping("/mine/{id}/decline")
    @Operation(summary = "Decline an email invitation sent to me", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> declineMine(@PathVariable String id) {
        teamService.declineMine(id);
        return ApiResponse.<Void>builder().build();
    }

    @GetMapping("/token/{token}")
    @Operation(summary = "Preview an invitation from its link token", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<TeamInvitationPreviewResponse> preview(@PathVariable String token) {
        return ApiResponse.<TeamInvitationPreviewResponse>builder()
                .result(teamService.preview(token))
                .build();
    }

    @PostMapping("/token/{token}/accept")
    @Operation(summary = "Accept an invitation from its link token (one-time)", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<TeamResponse> accept(@PathVariable String token) {
        return ApiResponse.<TeamResponse>builder().result(teamService.accept(token)).build();
    }
}
