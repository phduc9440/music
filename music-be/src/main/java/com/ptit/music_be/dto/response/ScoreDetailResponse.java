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

/** Trang chi tiết bản nhạc: thông tin + file + các tác vụ gần nhất. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ScoreDetailResponse {
    String id;
    String title;
    String composer;
    DifficultyLevel difficulty;
    String studyNotes;
    String processingStatus;
    String rejectReason;
    String sourceType;
    String visibility;
    Boolean isOfficial;

    /** Thể loại đã gắn, sắp xếp theo tên. */
    List<TagResponse> tags;

    String keySignature;
    String timeSignature;
    Integer tempoBpm;
    Integer measureCount;
    Integer staffCount;
    Integer pageCount;
    Integer currentVersion;
    Long viewCount;
    /** Điểm sao trung bình (1 chữ số thập phân); null nếu chưa ai chấm. */
    Double averageRating;
    /** Số lượt chấm sao. */
    long ratingCount;

    /** Email chủ sở hữu (null với bản nhạc chính thức không có chủ). */
    String ownerEmail;
    /** Người đang xem có quyền sửa không (ẩn/hiện nút Sửa, Xóa, Mở Editor). */
    boolean canEdit;
    /** Người đang xem có quyền xóa không (chỉ chủ sở hữu hoặc ADMIN). */
    boolean canDelete;
    /** Người đang xem có quyền nhận xét (chấm sao, bình luận) không. */
    boolean canReview;
    /** Người đang xem có quyền quản lý chia sẻ (chủ sở hữu hoặc ADMIN) không. */
    boolean canManageSharing;
    /** Cấp truy cập hiện tại: OWNER / EDIT / REVIEW / VIEW. */
    String accessLevel;

    LocalDateTime createdAt;
    LocalDateTime updatedAt;

    List<ScoreFileResponse> files;
    /** Task mới nhất của mỗi loại (OMR_CONVERSION, AUDIO_SYNTHESIS, ...). */
    List<AiTaskResponse> latestTasks;
}
