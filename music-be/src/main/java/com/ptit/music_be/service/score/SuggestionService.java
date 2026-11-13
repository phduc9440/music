package com.ptit.music_be.service.score;

import org.springframework.web.multipart.MultipartFile;

import com.ptit.music_be.dto.enums.score.SuggestionFilter;
import com.ptit.music_be.dto.request.score.SuggestionDecisionRequest;
import com.ptit.music_be.dto.response.common.PageResponse;
import com.ptit.music_be.dto.response.score.SuggestionDetailResponse;
import com.ptit.music_be.dto.response.score.SuggestionSummaryResponse;

/**
 * Đề xuất sửa (mục 4.3): người có quyền nhận xét sửa thử một bản nhạc mà không đụng bản chính; người có quyền sửa xem từng
 * ô thay đổi rồi nhận hoặc từ chối. Nhận thì thành version MusicXML mới ghi tên người đề xuất.
 */
public interface SuggestionService {

    /**
     * Gửi đề xuất. Cần quyền REVIEW. Lỗi theo thứ tự: SCORE_NOT_EXISTED (2001), UNAUTHORIZED (1002), SCORE_BUSY (2201),
     * SUGGESTION_FIELDS_INVALID (3110), FILE_TOO_LARGE (2005), MUSICXML_INVALID (2013), SCORE_VERSION_NOT_EXISTED (2801),
     * SUGGESTION_TOO_MANY_OPEN (3112), SUGGESTION_RATE_LIMITED (3117), SUGGESTION_EMPTY (3111).
     *
     * @param baseVersion version MusicXML mà người gửi đã sửa trên đó
     */
    SuggestionDetailResponse create(
            String scoreId, MultipartFile file, Integer baseVersion, String title, String description);

    /**
     * Danh sách đề xuất của bản nhạc, mới nhất trước. Người có quyền sửa thấy tất cả, người chỉ có REVIEW chỉ thấy của
     * mình. Lỗi: SCORE_NOT_EXISTED (2001), UNAUTHORIZED (1002) nếu dưới mức REVIEW.
     */
    PageResponse<SuggestionSummaryResponse> list(String scoreId, SuggestionFilter filter, int page, int size);

    /**
     * Chi tiết đề xuất, kèm xung đột và lỗi thời tính theo bản hiện hành. Lỗi: SUGGESTION_NOT_EXISTED (3115) cũng dùng cho
     * người chỉ có REVIEW xem đề xuất của người khác, SCORE_NOT_EXISTED (2001), UNAUTHORIZED (1002).
     */
    SuggestionDetailResponse get(String suggestionId);

    /** Nội dung MusicXML của đề xuất. Quyền như {@link #get}; FILE_NOT_EXISTED (2002) khi file đã dọn. */
    byte[] content(String suggestionId);

    /**
     * Nhận các ô được chọn (hoặc tất cả khi {@code changeIds} null), tạo version mới. Cần quyền sửa. Lỗi theo thứ tự:
     * SUGGESTION_NOT_EXISTED (3115), SCORE_NOT_EXISTED (2001), UNAUTHORIZED (1002), SUGGESTION_NOT_OPEN (3114),
     * SUGGESTION_FIELDS_INVALID (3110), SUGGESTION_CHANGES_INVALID (3116), SCORE_VERSION_CONFLICT (2014),
     * SUGGESTION_OUTDATED (3113), FILE_NOT_EXISTED (2002) với đề xuất đổi cấu trúc mà file đã dọn.
     *
     * @param ifMatch giá trị header If-Match, dạng {@code "v{currentVersion}"}
     */
    SuggestionDetailResponse accept(String suggestionId, String ifMatch, SuggestionDecisionRequest request);

    /**
     * Từ chối đề xuất (OUTDATED nếu lúc này đã lỗi thời). Cần quyền sửa. Lỗi như {@link #accept} trừ các lỗi về
     * If-Match, ô được chọn và lỗi thời.
     */
    SuggestionDetailResponse reject(String suggestionId, SuggestionDecisionRequest request);

    /** Người đề xuất rút lại đề xuất còn mở. Lỗi: SUGGESTION_NOT_OPEN (3114), UNAUTHORIZED (1002). */
    void withdraw(String suggestionId);

    /** Xóa file của đề xuất đã đóng quá 30 ngày (giữ dòng DB cho lịch sử); trả về số đề xuất đã dọn. */
    int cleanupClosedFiles();
}
