package com.ptit.music_be.service.score;

import java.util.List;

import com.ptit.music_be.dto.enums.score.CommentStatus;
import com.ptit.music_be.dto.request.score.ScoreCommentReplyRequest;
import com.ptit.music_be.dto.request.score.ScoreCommentRequest;
import com.ptit.music_be.dto.request.score.ScoreCommentUpdateRequest;
import com.ptit.music_be.dto.response.score.CommentMemberResponse;
import com.ptit.music_be.dto.response.score.ScoreCommentResponse;
import com.ptit.music_be.dto.response.score.ScoreCommentsResponse;

/**
 * Góp ý gắn vào ô nhịp (mục 4.2). Xem cần VIEW; viết và trả lời cần REVIEW trở lên; sửa nội dung chỉ người viết; xóa
 * người viết hoặc chủ bản nhạc; đánh dấu đã xử lý người viết, chủ hoặc người có quyền sửa (EDIT).
 */
public interface ScoreCommentService {

    /**
     * Góp ý gốc kèm trả lời. {@code mentioned} true: chỉ các góp ý có nhắc tới người đang xem (mọi trạng thái); ngược lại
     * lọc theo {@code status} (null là tất cả).
     */
    ScoreCommentsResponse list(String scoreId, CommentStatus status, boolean mentioned);

    ScoreCommentResponse create(String scoreId, ScoreCommentRequest request);

    /** Trả lời; trả lời vào một trả lời thì gắn vào góp ý gốc của nó (chỉ một cấp). Trả về cả luồng góp ý. */
    ScoreCommentResponse reply(String commentId, ScoreCommentReplyRequest request);

    /** Sửa nội dung / @nhắc tên / trạng thái. Trả về cả luồng góp ý. */
    ScoreCommentResponse update(String commentId, ScoreCommentUpdateRequest request);

    /** Xóa góp ý (góp ý gốc thì xóa theo các trả lời). */
    void delete(String commentId);

    /** Người có thể @nhắc: xem được bản nhạc (chủ, người được chia sẻ, thành viên team; bản công khai thêm người đã góp ý). */
    List<CommentMemberResponse> mentionable(String scoreId, String keyword);
}
