package com.ptit.music_be.controller.team;

import java.util.List;

import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.request.ShowRequest;
import com.ptit.music_be.dto.request.TeamInviteRequest;
import com.ptit.music_be.dto.request.TeamRequest;
import com.ptit.music_be.dto.request.TeamRoleRequest;
import com.ptit.music_be.dto.request.TeamScoreRequest;
import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.PageResponse;
import com.ptit.music_be.dto.response.RestorableItemResponse;
import com.ptit.music_be.dto.response.ShowResponse;
import com.ptit.music_be.dto.response.TeamActivityResponse;
import com.ptit.music_be.dto.response.TeamInvitationResponse;
import com.ptit.music_be.dto.response.TeamMemberResponse;
import com.ptit.music_be.dto.response.TeamResponse;
import com.ptit.music_be.dto.response.TeamScoreResponse;
import com.ptit.music_be.dto.response.TeamTaskResponse;
import com.ptit.music_be.service.team.ShowService;
import com.ptit.music_be.service.team.TeamService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/teams")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Teams", description = "Team và Show (mục 4.1): team, thành viên, lời mời, bản nhạc, hoạt động")
public class TeamController {

    TeamService teamService;
    ShowService showService;

    private static <T> ApiResponse<T> ok(T result) {
        return ApiResponse.<T>builder().result(result).build();
    }

    @GetMapping
    @Operation(summary = "My teams with my role", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<TeamResponse>> list() {
        return ok(teamService.myTeams());
    }

    @PostMapping
    @Operation(summary = "Create a team (needs a plan with team feature)", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<TeamResponse> create(@RequestBody TeamRequest request) {
        return ok(teamService.create(request));
    }

    @GetMapping("/deleted")
    @Operation(summary = "Teams I own and deleted myself, still restorable (30 days)", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<RestorableItemResponse>> deleted() {
        return ok(teamService.deletedTeams());
    }

    @GetMapping("/my-tasks")
    @Operation(summary = "Show items assigned to me (arranger or reviewer), not approved yet", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<TeamTaskResponse>> myTasks() {
        return ok(teamService.myTasks());
    }

    @GetMapping("/{id}")
    @Operation(summary = "Team detail (members only)", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<TeamResponse> get(@PathVariable String id) {
        return ok(teamService.get(id));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Rename / describe team (OWNER, MANAGER)", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<TeamResponse> update(@PathVariable String id, @RequestBody TeamRequest request) {
        return ok(teamService.update(id, request));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Soft-delete team (OWNER); restorable for 30 days, 3801 not found, 3802 not owner", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> delete(@PathVariable String id) {
        teamService.delete(id);
        return ApiResponse.<Void>builder().build();
    }

    @PostMapping("/{id}/restore")
    @Operation(summary = "Restore a team I deleted (OWNER, within 30 days); 3818 expired, 3819 deleted by admin", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<TeamResponse> restore(@PathVariable String id) {
        return ok(teamService.restore(id));
    }

    // ---- thành viên

    @GetMapping("/{id}/members")
    @Operation(summary = "Team members", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<TeamMemberResponse>> members(@PathVariable String id) {
        return ok(teamService.members(id));
    }

    @PatchMapping("/{id}/members/{memberId}")
    @Operation(summary = "Change a member's role (OWNER, MANAGER)", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<TeamMemberResponse> changeRole(
            @PathVariable String id, @PathVariable String memberId, @RequestBody TeamRoleRequest request) {
        return ok(teamService.changeRole(id, memberId, request == null ? null : request.getRole()));
    }

    @DeleteMapping("/{id}/members/{memberId}")
    @Operation(summary = "Remove a member (OWNER, MANAGER) or leave the team (own id)", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> removeMember(@PathVariable String id, @PathVariable String memberId) {
        teamService.removeMember(id, memberId);
        return ApiResponse.<Void>builder().build();
    }

    // ---- lời mời

    @GetMapping("/{id}/invitations")
    @Operation(summary = "Pending invitations (OWNER, MANAGER)", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<TeamInvitationResponse>> invitations(@PathVariable String id) {
        return ok(teamService.invitations(id));
    }

    @PostMapping("/{id}/invitations")
    @Operation(summary = "Invite by email or create a one-time link (token returned once)", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<TeamInvitationResponse> invite(@PathVariable String id, @RequestBody TeamInviteRequest request) {
        return ok(teamService.invite(id, request));
    }

    @DeleteMapping("/{id}/invitations/{invitationId}")
    @Operation(summary = "Revoke an invitation", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> revoke(@PathVariable String id, @PathVariable String invitationId) {
        teamService.revokeInvitation(id, invitationId);
        return ApiResponse.<Void>builder().build();
    }

    // ---- bản nhạc

    @GetMapping("/{id}/scores")
    @Operation(summary = "Scores of the team", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<TeamScoreResponse>> scores(@PathVariable String id) {
        return ok(teamService.scores(id));
    }

    @GetMapping("/{id}/scores/candidates")
    @Operation(summary = "My personal scores that can be moved into the team", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<TeamScoreResponse>> candidates(@PathVariable String id) {
        return ok(teamService.myPersonalScores(id));
    }

    @PostMapping("/{id}/scores")
    @Operation(summary = "Move my personal score into the team (score owner only)", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<TeamScoreResponse> addScore(@PathVariable String id, @RequestBody TeamScoreRequest request) {
        return ok(teamService.addScore(id, request == null ? null : request.getScoreId()));
    }

    @DeleteMapping("/{id}/scores/{scoreId}")
    @Operation(summary = "Move a score out of the team (score owner, OWNER, MANAGER)", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> removeScore(@PathVariable String id, @PathVariable String scoreId) {
        teamService.removeScore(id, scoreId);
        return ApiResponse.<Void>builder().build();
    }

    // ---- show, hoạt động

    @GetMapping("/{id}/shows")
    @Operation(summary = "Shows of the team (preparing first)", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<ShowResponse>> shows(@PathVariable String id) {
        return ok(showService.shows(id));
    }

    @GetMapping("/{id}/shows/deleted")
    @Operation(summary = "Deleted shows of the team, still restorable (OWNER, MANAGER; 30 days)", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<RestorableItemResponse>> deletedShows(@PathVariable String id) {
        return ok(showService.deletedShows(id));
    }

    @PostMapping("/{id}/shows")
    @Operation(summary = "Create a show (OWNER, MANAGER)", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ShowResponse> createShow(@PathVariable String id, @RequestBody ShowRequest request) {
        return ok(showService.create(id, request));
    }

    @GetMapping("/{id}/activities")
    @Operation(summary = "Team activity log, newest first", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PageResponse<TeamActivityResponse>> activities(
            @PathVariable String id,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ok(teamService.activities(id, page, size));
    }
}
