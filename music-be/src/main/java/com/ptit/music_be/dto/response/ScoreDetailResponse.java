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
    /** Bản trong kho mẫu: tên người phối (chủ bản gốc). */
    String arrangerName;
    /** Bản sao trong kho mẫu mà người đang xem là chủ của bản gốc: id bản gốc của họ, để mở lại bản của mình. */
    String myOriginalScoreId;

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
    /** Người đang xem có quyền quản lý chia sẻ (chủ sở hữu hoặc SUPER_ADMIN) không. */
    boolean canManageSharing;
    /** Cấp truy cập hiện tại: OWNER / EDIT / REVIEW / VIEW. */
    String accessLevel;
    /** Người đang xem có được tải MusicXML, MIDI, âm thanh, PDF không. */
    boolean canDownload;
    /** Chủ sở hữu đã cho người xem tải chưa (chỉ chủ sở hữu thấy giá trị thật). */
    boolean allowDownload;
    /** Team chứa bản nhạc (mục 4.1); null là bản cá nhân. */
    String teamId;
    String teamName;

    LocalDateTime createdAt;
    LocalDateTime updatedAt;

    List<ScoreFileResponse> files;
    /** Task mới nhất của mỗi loại (OMR_CONVERSION, AUDIO_SYNTHESIS, ...). */
    List<AiTaskResponse> latestTasks;
}
