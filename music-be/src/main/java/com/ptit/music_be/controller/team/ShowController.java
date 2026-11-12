package com.ptit.music_be.controller.team;

import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.request.ShowItemOrderRequest;
import com.ptit.music_be.dto.request.ShowItemRequest;
import com.ptit.music_be.dto.request.ShowItemStatusRequest;
import com.ptit.music_be.dto.request.ShowRequest;
import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.ShowDetailResponse;
import com.ptit.music_be.dto.response.ShowResponse;
import com.ptit.music_be.service.team.ShowService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/shows")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Shows", description = "Show của team (mục 4.1): bài, phân công, Kanban, thứ tự diễn")
public class ShowController {

    ShowService showService;

    private static <T> ApiResponse<T> ok(T result) {
        return ApiResponse.<T>builder().result(result).build();
    }

    @GetMapping("/{id}")
    @Operation(summary = "Show with items, my role and assignable members", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ShowDetailResponse> get(@PathVariable String id) {
        return ok(showService.get(id));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update show (OWNER, MANAGER)", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ShowResponse> update(@PathVariable String id, @RequestBody ShowRequest request) {
        return ok(showService.update(id, request));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete show (OWNER, MANAGER)", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> delete(@PathVariable String id) {
        showService.delete(id);
        return ApiResponse.<Void>builder().build();
    }

    @PostMapping("/{id}/items")
    @Operation(summary = "Add a team score to the show (OWNER, MANAGER)", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ShowDetailResponse> addItem(@PathVariable String id, @RequestBody ShowItemRequest request) {
        return ok(showService.addItem(id, request));
    }

    @PutMapping("/{id}/items/order")
    @Operation(summary = "Reorder items (performance order)", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ShowDetailResponse> reorder(@PathVariable String id, @RequestBody ShowItemOrderRequest request) {
        return ok(showService.reorder(id, request));
    }

    @PutMapping("/{id}/items/{itemId}")
    @Operation(summary = "Assign arranger, reviewer, due date, notes (OWNER, MANAGER)", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ShowDetailResponse> updateItem(
            @PathVariable String id, @PathVariable String itemId, @RequestBody ShowItemRequest request) {
        return ok(showService.updateItem(id, itemId, request));
    }

    @DeleteMapping("/{id}/items/{itemId}")
    @Operation(summary = "Remove an item from the show (OWNER, MANAGER)", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ShowDetailResponse> removeItem(@PathVariable String id, @PathVariable String itemId) {
        return ok(showService.removeItem(id, itemId));
    }

    @PatchMapping("/{id}/items/{itemId}/status")
    @Operation(summary = "Change item status: drag on Kanban, submit, approve, return with note", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ShowDetailResponse> changeStatus(
            @PathVariable String id, @PathVariable String itemId, @RequestBody ShowItemStatusRequest request) {
        return ok(showService.changeStatus(id, itemId, request));
    }
}
