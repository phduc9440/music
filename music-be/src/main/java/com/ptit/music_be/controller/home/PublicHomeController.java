package com.ptit.music_be.controller.home;

import java.time.Duration;

import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ptit.music_be.dto.response.common.ApiResponse;
import com.ptit.music_be.dto.response.home.PublicHomeResponse;
import com.ptit.music_be.service.home.HomeService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

/** API cho khách chưa đăng nhập (SecurityConfig cho phép GET /api/public/**). Chỉ trả dữ liệu của bản PUBLIC. */
@RestController
@RequestMapping("/api/public")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Public home", description = "Trang chủ cho khách, không cần đăng nhập")
public class PublicHomeController {

    HomeService homeService;

    @GetMapping("/home")
    @Operation(summary = "Guest home page: featured public scores, top composers, real stats (cached 5 minutes)")
    public ResponseEntity<ApiResponse<PublicHomeResponse>> getHome() {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic())
                .body(ApiResponse.<PublicHomeResponse>builder()
                        .result(homeService.getPublicHome())
                        .build());
    }

    @GetMapping("/scores/{scoreId}/thumbnail")
    @Operation(summary = "Page-1 image of a PUBLIC score, for cards shown to guests")
    public ResponseEntity<Resource> getThumbnail(@PathVariable String scoreId) {
        HomeService.Thumbnail thumbnail = homeService.loadPublicThumbnail(scoreId);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePublic())
                .contentType(MediaType.parseMediaType(thumbnail.contentType()))
                .body(thumbnail.resource());
    }
}
