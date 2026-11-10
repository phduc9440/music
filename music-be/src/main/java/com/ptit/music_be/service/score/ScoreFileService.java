package com.ptit.music_be.service.score;

import java.util.List;

import org.springframework.core.io.Resource;

import com.ptit.music_be.dto.enums.FileType;
import com.ptit.music_be.dto.response.ScoreFileResponse;
import com.ptit.music_be.entity.Score;

/**
 * Danh sách / tải file của bản nhạc và các hàm kiểm tra quyền. Mọi hàm quyền ở đây chỉ đổi mức truy cập do
 * {@code ScorePermissionService} tính ra thành câu hỏi có/không, không tự tính quyền.
 */
public interface ScoreFileService {

    /**
     * Danh sách file của bản nhạc; {@code type} khác null thì chỉ lấy đúng loại file đó. Người xem dưới quyền sửa không
     * thấy file gốc (PDF/ảnh/MusicXML/MIDI gốc, kern, ảnh trang).
     */
    List<ScoreFileResponse> getFilesOfScore(String scoreId, FileType type);

    DownloadableFile loadForDownload(String fileId);

    /**
     * Như {@link #loadForDownload(String)}; {@code inline = true} (hiển thị trong trình duyệt) cho phép người xem tải
     * ảnh trang 1 làm ảnh đại diện mà không cần quyền sửa.
     */
    DownloadableFile loadForDownload(String fileId, boolean inline);

    /** Throws UNAUTHORIZED unless the current member can view the score (see {@link #canView}). */
    void checkCanView(Score score);

    /** Throws UNAUTHORIZED unless the current member can edit the score (see {@link #canEdit}). */
    void checkCanEdit(Score score);

    /** Xem được nếu mức truy cập từ VIEW trở lên (chủ, được chia sẻ, qua team, bản công khai, ADMIN kiểm duyệt). */
    boolean canView(Score score);

    /** Sửa được nếu mức truy cập từ EDIT trở lên. ADMIN chỉ sửa được bản trong kho mẫu; SUPER_ADMIN cũng vậy. */
    boolean canEdit(Score score);

    /** Xóa được nếu là chủ sở hữu, hoặc ADMIN kiểm duyệt bản đang PUBLIC / PENDING. */
    boolean canDelete(Score score);

    /** Nhận xét (chấm sao, bình luận) được nếu mức truy cập từ REVIEW trở lên. */
    boolean canReview(Score score);

    /** Throws UNAUTHORIZED unless the current member can review the score (see {@link #canReview}). */
    void checkCanReview(Score score);

    /** Chỉ chủ sở hữu: quản lý chia sẻ, duyệt yêu cầu xin quyền, đổi chế độ hiển thị, cho phép tải. */
    boolean canManageSharing(Score score);

    void checkCanManageSharing(Score score);

    /**
     * Tải được MusicXML, MIDI, âm thanh, PDF, SVG của bản nhạc: người có quyền sửa, hoặc người xem khi chủ bật
     * {@code allowDownload}.
     */
    boolean canDownload(Score score);

    /** Throws UNAUTHORIZED unless the current member can download the score (see {@link #canDownload}). */
    void checkCanDownload(Score score);

    /**
     * Cấp truy cập của người đang đăng nhập: "OWNER", "EDIT", "REVIEW", "VIEW", hoặc null nếu không có quyền. ADMIN kiểm
     * duyệt bản chờ duyệt nhận "VIEW".
     */
    String getAccessLevel(Score score);

    record DownloadableFile(Resource resource, String fileName, String contentType) {}
}
