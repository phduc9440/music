package com.ptit.music_be.controller.score;

import java.util.List;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ptit.music_be.dto.response.common.ApiResponse;
import com.ptit.music_be.dto.response.score.OfficialRequestResponse;
import com.ptit.music_be.service.score.OfficialRequestService;

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
        name = "Official library requests",
        description = "Admins ask owners to add a public score to the curated library; the owner decides")
public class OfficialRequestController {

    OfficialRequestService officialRequestService;

    @PostMapping("/scores/{scoreId}/official-request")
    @Operation(
            summary = "ADMIN: ask the owner to add a public score to the curated library (owner is notified)",
            description = "A score owned by the system account joins the library right away.",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<OfficialRequestResponse> request(@PathVariable String scoreId) {
        return ApiResponse.<OfficialRequestResponse>builder()
                .result(officialRequestService.request(scoreId))
                .build();
    }

    @GetMapping("/official-requests/mine")
    @Operation(
            summary = "Pending requests that ask me to add one of my scores to the curated library",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<OfficialRequestResponse>> mine() {
        return ApiResponse.<List<OfficialRequestResponse>>builder()
                .result(officialRequestService.getMine())
                .build();
    }

    @PostMapping("/official-requests/{requestId}/accept")
    @Operation(
            summary = "Owner agrees: a copy goes to the curated library credited to the owner, the original is untouched",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<OfficialRequestResponse> accept(@PathVariable String requestId) {
        return ApiResponse.<OfficialRequestResponse>builder()
                .result(officialRequestService.accept(requestId))
                .build();
    }

    @PostMapping("/official-requests/{requestId}/decline")
    @Operation(
            summary = "Owner declines: nothing is copied and the requesting admin is notified",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<OfficialRequestResponse> decline(@PathVariable String requestId) {
        return ApiResponse.<OfficialRequestResponse>builder()
                .result(officialRequestService.decline(requestId))
                .build();
    }

    @DeleteMapping("/official-requests/{requestId}")
    @Operation(
            summary = "ADMIN: withdraw a pending request",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<OfficialRequestResponse> cancel(@PathVariable String requestId) {
        return ApiResponse.<OfficialRequestResponse>builder()
                .result(officialRequestService.cancel(requestId))
                .build();
    }
}
