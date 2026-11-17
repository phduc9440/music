package com.ptit.music_be.controller.score;

import java.util.List;

import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.request.score.AccessRequestRequest;
import com.ptit.music_be.dto.request.score.ScoreLinkRequest;
import com.ptit.music_be.dto.request.score.ShareMemberRequest;
import com.ptit.music_be.dto.request.score.SharePermissionRequest;
import com.ptit.music_be.dto.response.common.ApiResponse;
import com.ptit.music_be.dto.response.score.AccessRequestResponse;
import com.ptit.music_be.dto.response.score.MyAccessResponse;
import com.ptit.music_be.dto.response.score.ScoreSharingResponse;
import com.ptit.music_be.service.score.ScoreSharingService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(
        name = "Score sharing",
        description = "Quản lý người được chia sẻ và yêu cầu xin quyền (1 xem, 2 nhận xét, 3 chỉnh sửa)")
public class ScoreSharingController {

    ScoreSharingService sharingService;

    @GetMapping("/scores/{scoreId}/sharing")
    @Operation(
            summary = "Sharing state of a score (owner or SUPER_ADMIN only)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ScoreSharingResponse> getSharing(@PathVariable String scoreId) {
        return ok(sharingService.getSharing(scoreId));
    }

    @PostMapping("/scores/{scoreId}/sharing/members")
    @Operation(
            summary = "Invite a member by email with a level (changes the level if already shared)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ScoreSharingResponse> addMember(
            @PathVariable String scoreId, @Valid @RequestBody ShareMemberRequest request) {
        return ok(sharingService.addMember(scoreId, request.getEmail(), request.getPermission()));
    }

    @PutMapping("/scores/{scoreId}/sharing/members/{memberId}")
    @Operation(summary = "Change a member's level", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ScoreSharingResponse> updateMember(
            @PathVariable String scoreId,
            @PathVariable String memberId,
            @Valid @RequestBody SharePermissionRequest request) {
        return ok(sharingService.updateMember(scoreId, memberId, request.getPermission()));
    }

    @DeleteMapping("/scores/{scoreId}/sharing/members/{memberId}")
    @Operation(summary = "Revoke a member's access", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ScoreSharingResponse> removeMember(@PathVariable String scoreId, @PathVariable String memberId) {
        return ok(sharingService.removeMember(scoreId, memberId));
    }

    @PostMapping("/scores/{scoreId}/access-requests")
    @Operation(
            summary = "Ask the owner for view (1), review (2) or edit (3) access",
            description =
                    "Stored in the caller's member_scores row until the owner approves or rejects."
                            + " Errors: 2404 already has that access or higher (including a PUBLIC score, which everyone can view and review)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<MyAccessResponse> requestAccess(
            @PathVariable String scoreId, @Valid @RequestBody AccessRequestRequest request) {
        return ok(sharingService.requestAccess(scoreId, request.getPermission(), request.getMessage()));
    }

    @GetMapping("/scores/{scoreId}/access-requests/me")
    @Operation(
            summary = "My current access and pending request for a score",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<MyAccessResponse> getMyAccess(@PathVariable String scoreId) {
        return ok(sharingService.getMyAccess(scoreId));
    }

    @GetMapping("/scores/{scoreId}/access-requests")
    @Operation(
            summary = "Pending access requests (owner or SUPER_ADMIN only)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<AccessRequestResponse>> getAccessRequests(@PathVariable String scoreId) {
        return ok(sharingService.getAccessRequests(scoreId));
    }

    @PostMapping("/scores/{scoreId}/access-requests/{memberId}/approve")
    @Operation(
            summary = "Approve a request; optional body {permission} grants a different level than asked",
            description = "Errors: 2402 no pending request",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ScoreSharingResponse> approveRequest(
            @PathVariable String scoreId,
            @PathVariable String memberId,
            @RequestBody(required = false) ScoreLinkRequest body) {
        return ok(sharingService.approveRequest(scoreId, memberId, body == null ? null : body.getPermission()));
    }

    @PostMapping("/scores/{scoreId}/access-requests/{memberId}/reject")
    @Operation(summary = "Reject a request", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ScoreSharingResponse> rejectRequest(
            @PathVariable String scoreId, @PathVariable String memberId) {
        return ok(sharingService.rejectRequest(scoreId, memberId));
    }

    private static <T> ApiResponse<T> ok(T result) {
        return ApiResponse.<T>builder().result(result).build();
    }
}
