package com.ptit.music_be.service.score;

import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;

/** Sao chép một bản nhạc thành bản mới của người khác (kho mẫu, tạo bản phối). */
public interface ScoreCopyService {

    /**
     * Tạo bản sao riêng tư (PRIVATE) của {@code sourceScoreId} cho {@code newOwner}. Chỉ chép MusicXML hiện hành thành
     * v1 của bản mới cùng metadata nhạc (khóa, nhịp, tempo, số ô, số khuông), không chép file gốc, kern, ảnh trang,
     * file xuất, chia sẻ hay đánh giá.
     *
     * <p><b>Không kiểm tra quyền</b>: bên gọi phải tự kiểm tra người dùng được phép sao chép bản nhạc này (ví dụ ADMIN
     * đưa vào kho mẫu, hoặc người xem tạo bản phối từ bản công khai cho phép). Phải gọi trong một transaction; file chỉ
     * còn lại trên đĩa khi transaction commit.
     *
     * @throws com.ptit.music_be.exception.AppException {@code SCORE_NOT_EXISTED} nếu không có bản nhạc nguồn,
     *     {@code MUSICXML_NOT_READY} nếu nó chưa có MusicXML
     */
    Score copy(String sourceScoreId, Member newOwner, CopyOptions options);
}
