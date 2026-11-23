package com.ptit.music_be.controller.library;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ptit.music_be.dto.response.common.ApiResponse;
import com.ptit.music_be.dto.response.library.TagResponse;
import com.ptit.music_be.service.library.TagService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/tags")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Tags", description = "Danh sách thể loại để gắn nhãn bản nhạc")
public class TagController {

    TagService tagService;

    @GetMapping
    @Operation(summary = "List all tags (sorted by name)", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<TagResponse>> getAllTags() {
        return ApiResponse.<List<TagResponse>>builder()
                .result(tagService.getAllTags())
                .build();
    }
}
