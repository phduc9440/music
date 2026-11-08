package com.ptit.music_be.dto.response;

import java.time.LocalDateTime;
import java.util.List;

import com.ptit.music_be.dto.enums.DifficultyLevel;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;

/** Một thẻ trong lưới "Bản nhạc của tôi". */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ScoreSummaryResponse {
    String id;
    String title;
    String composer;
    DifficultyLevel difficulty;
    /** NONE / PENDING / PROCESSING / COMPLETED / FAILED (xem ProcessingStatus). */
    String processingStatus;
    /** OMR / IMPORT / MANUAL (xem ScoreSource). */
    String sourceType;
    /** PRIVATE / PUBLIC (xem Visibility). */
    String visibility;

    Integer measureCount;
    /** Chỉ có trong danh sách "Được chia sẻ với tôi": cấp của người xem (VIEW / REVIEW / EDIT). */
    String accessLevel;
    /** Chỉ có trong danh sách "Được chia sẻ với tôi": email chủ sở hữu. */
    String ownerEmail;
    /** Thể loại đã gắn, sắp xếp theo tên. */
    List<TagResponse> tags;
    /** Ảnh trang 1 (đường dẫn tương đối so với host, ví dụ /api/files/{id}/download?inline=true); null nếu chưa có. */
    String thumbnailUrl;

    LocalDateTime createdAt;
    LocalDateTime updatedAt;
}
