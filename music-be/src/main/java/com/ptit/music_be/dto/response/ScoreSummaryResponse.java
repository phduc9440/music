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

    /** Có nằm trong kho bản nhạc mẫu không (trang admin dùng). */
    Boolean isOfficial;

    Integer measureCount;
    /** Chỉ có trong danh sách "Được chia sẻ với tôi": cấp của người xem (VIEW / REVIEW / EDIT). */
    String accessLevel;
    /** Chỉ có trong danh sách "Được chia sẻ với tôi": email chủ sở hữu. */
    String ownerEmail;
    /** Thể loại đã gắn, sắp xếp theo tên. */
    List<TagResponse> tags;
    /** Bản trong kho mẫu: tên người phối (chủ bản gốc). */
    String arrangerName;
    /** Chỉ có trong trang Khám phá: tên người chia sẻ (không lộ email). */
    String ownerName;
    /** Chỉ có trong trang Khám phá: lượt xem, điểm sao trung bình (null nếu chưa ai chấm) và số lượt chấm. */
    Long viewCount;

    Double ratingAverage;
    Long ratingCount;
    /** Ảnh trang 1 (đường dẫn tương đối so với host, ví dụ /api/files/{id}/download?inline=true); null nếu chưa có. */
    String thumbnailUrl;
    /** Ảnh bìa người dùng tải lên (đường dẫn tuyệt đối, ai cũng xem được); null thì dùng thumbnailUrl. */
    String coverUrl;

    LocalDateTime createdAt;
    LocalDateTime updatedAt;
}
