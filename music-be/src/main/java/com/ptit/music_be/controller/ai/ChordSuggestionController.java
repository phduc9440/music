package com.ptit.music_be.controller.ai;

import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ptit.music_be.dto.request.ai.ChordSuggestionRequest;
import com.ptit.music_be.dto.response.ai.AiTaskResponse;
import com.ptit.music_be.dto.response.common.ApiResponse;
import com.ptit.music_be.service.ai.ChordSuggestionService;

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
@Tag(name = "Chord suggestions", description = "Gợi ý hợp âm tự động bằng HMM (R3)")
public class ChordSuggestionController {

    ChordSuggestionService chordSuggestionService;

    @PostMapping("/scores/{scoreId}/chord-suggestions")
    @Operation(
            summary = "Gợi ý hợp âm cho version hiện hành (tạo tác vụ CHORD_GENERATION)",
            description =
                    "Cần quyền nhận xét. Kết quả là đề xuất sửa do hệ thống gửi; theo dõi bằng GET /api/ai-tasks/{id},"
                            + " xong thì result.resultData.suggestionId. Errors: 2001, 1002, 3130 phong cách sai, 2201 OMR đang chạy,"
                            + " 3131 đang gợi ý, 3132 đã có gợi ý chờ duyệt (result.suggestionId), 3702 hết hạn mức",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<AiTaskResponse> request(
            @PathVariable String scoreId, @RequestBody(required = false) ChordSuggestionRequest request) {
        return ApiResponse.<AiTaskResponse>builder()
                .result(chordSuggestionService.request(scoreId, request))
                .build();
    }
}
