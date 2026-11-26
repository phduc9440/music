package com.ptit.music_be.dto.response.score;

import java.time.LocalDateTime;
import java.util.List;

import com.ptit.music_be.dto.enums.score.DifficultyLevel;
import com.ptit.music_be.dto.enums.score.ScoreLicense;
import com.ptit.music_be.dto.response.ai.AiTaskResponse;
import com.ptit.music_be.dto.response.library.TagResponse;

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

    /** Email chủ sở hữu: chỉ trả cho chính chủ và quản trị viên (N-05); null với người khác hoặc bản không có chủ. */
    String ownerEmail;
    /** Tên hiển thị của chủ sở hữu (họ tên, thiếu thì phần trước @ của email); null với bản không có chủ. */
    String ownerName;
    /** Người đang xem có quyền sửa không (ẩn/hiện nút Sửa, Xóa, Mở Editor). */
    boolean canEdit;
    /** Người đang xem có quyền xóa không (chỉ chủ sở hữu hoặc ADMIN). */
    boolean canDelete;
    /** Người đang xem có quyền nhận xét bản nhạc (chấm sao, bình luận chung) không: xem được là nhận xét được. */
    boolean canReview;
    /** Người đang xem được góp ý trên ô nhịp (và gửi đề xuất sửa) không: cần chủ cho phép, trừ chủ và người sửa được. */
    boolean canComment;
    /** Người đang xem có quyền quản lý chia sẻ (chủ sở hữu hoặc SUPER_ADMIN) không. */
    boolean canManageSharing;
    /** Cấp truy cập hiện tại: OWNER / EDIT / VIEW. */
    String accessLevel;
    /** Người đang xem có được tải MusicXML, MIDI, âm thanh, PDF không. */
    boolean canDownload;
    /** Chủ sở hữu đã cho người xem tải chưa (chỉ chủ sở hữu thấy giá trị thật). */
    boolean allowDownload;
    /** Giấy phép (R4); luôn có giá trị, chưa chọn là ALL_RIGHTS_RESERVED. */
    ScoreLicense license;
    /** Chủ cho phép tạo bản phối (chỉ chủ sở hữu thấy giá trị thật). */
    boolean allowArrange;
    /** Người đang xem tạo được bản phối từ bản này không (bản công khai, chủ cho phép, đã đăng nhập). */
    boolean canFork;
    /** Số bản phối tạo từ bản nhạc này (không tính bản trong thùng rác). */
    long forkCount;
    /** Bản phối của bản nào (R4); null khi không phải bản phối hoặc bản gốc không còn công khai. */
    ForkSource forkedFrom;
    /** Ảnh bìa người dùng tải lên; null nếu chưa có. */
    String coverUrl;
    /** Team chứa bản nhạc (mục 4.1); null là bản cá nhân. */
    String teamId;

    String teamName;

    LocalDateTime createdAt;
    LocalDateTime updatedAt;

    List<ScoreFileResponse> files;
    /** Task mới nhất của mỗi loại (OMR_CONVERSION, AUDIO_SYNTHESIS, ...). */
    List<AiTaskResponse> latestTasks;

    /** Ghi công bản gốc của một bản phối. Tên người chia sẻ tính khi trả, không lộ email. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class ForkSource {
        String id;
        String title;
        String ownerName;
        ScoreLicense license;
    }
}
