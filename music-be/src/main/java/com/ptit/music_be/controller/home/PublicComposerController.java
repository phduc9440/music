package com.ptit.music_be.controller.home;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.ptit.music_be.dto.response.common.ApiResponse;
import com.ptit.music_be.dto.response.composer.ComposerResponse;
import com.ptit.music_be.dto.response.home.ExploreFacetsResponse;
import com.ptit.music_be.repository.home.HomeQueryRepository;
import com.ptit.music_be.service.composer.ComposerService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

/** Nhạc sĩ và bộ lọc Khám phá, đọc được khi chưa đăng nhập (GET /api/public/**). */
@RestController
@RequestMapping("/api/public")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Public composers", description = "Nhạc sĩ (mục 5.4), không cần đăng nhập")
public class PublicComposerController {

    ComposerService composerService;
    HomeQueryRepository homeQueryRepository;

    @GetMapping("/composers")
    @Operation(
            summary = "Composers, most public scores first; keyword (name/aliases), "
                    + "period: BAROQUE | CLASSICAL | ROMANTIC | MODERN | VIETNAM")
    public ApiResponse<List<ComposerResponse>> list(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String period,
            @RequestParam(defaultValue = "100") int limit) {
        return ApiResponse.<List<ComposerResponse>>builder()
                .result(composerService.listPublic(keyword, period, limit))
                .build();
    }

    @GetMapping("/composers/{slug}")
    @Operation(summary = "One composer by slug (scores: use /api/scores/public?composerId= and /official?composerId=)")
    public ApiResponse<ComposerResponse> get(@PathVariable String slug) {
        return ApiResponse.<ComposerResponse>builder()
                .result(composerService.getBySlug(slug))
                .build();
    }

    @GetMapping("/explore/facets")
    @Operation(summary = "Filter values that exist among public scores (keys)")
    public ApiResponse<ExploreFacetsResponse> facets() {
        return ApiResponse.<ExploreFacetsResponse>builder()
                .result(ExploreFacetsResponse.builder()
                        .keys(homeQueryRepository.distinctPublicKeys())
                        .build())
                .build();
    }
}
