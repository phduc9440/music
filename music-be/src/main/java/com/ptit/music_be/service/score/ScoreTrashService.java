package com.ptit.music_be.service.score;

import java.util.List;

import com.ptit.music_be.dto.response.PageResponse;
import com.ptit.music_be.dto.response.TrashedScoreResponse;

/** Thùng rác của bản nhạc: xem, khôi phục, xóa hẳn. Việc chuyển vào thùng rác nằm ở {@code ScoreService#deleteScore}. */
public interface ScoreTrashService {

    /** Bản nhạc trong thùng rác của người đang đăng nhập, mới xóa nhất trước. */
    PageResponse<TrashedScoreResponse> getMyTrash(int page, int size);

    /** Chủ sở hữu khôi phục: 3301 nếu bản nhạc không nằm trong thùng rác của mình. */
    void restore(String scoreId);

    /** Chủ sở hữu xóa hẳn ngay một bản nhạc trong thùng rác: 3301 nếu không có trong thùng rác của mình. */
    void purge(String scoreId);

    /** Id các bản nhạc trong thùng rác đã quá số ngày lưu, tới hạn xóa hẳn. */
    List<String> findExpiredIds();

    /** Xóa hẳn một bản nhạc quá hạn (mỗi bản một transaction, do {@code ScoreTrashPurgeJob} gọi). */
    void purgeExpired(String scoreId);
}
