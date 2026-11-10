package com.ptit.music_be.service.score;

import java.util.List;

import com.ptit.music_be.dto.response.OfficialRequestResponse;
import com.ptit.music_be.dto.response.PageResponse;

/**
 * Đưa bản nhạc của người dùng vào kho score mẫu có sự đồng ý của chủ: quản trị viên xin, chủ trả lời, đồng ý thì bản
 * nhạc được sao chép sang tài khoản hệ thống (bản gốc của chủ giữ nguyên, chủ vẫn sửa và xóa được).
 */
public interface OfficialRequestService {

    /**
     * ADMIN: xin đưa một bản nhạc công khai vào kho mẫu. Bản của tài khoản hệ thống thì vào kho ngay (không cần xin).
     * Bản nhạc phải đang PUBLIC, chưa có trong kho, chưa có lời xin đang chờ và đã có MusicXML để sao chép.
     */
    OfficialRequestResponse request(String scoreId);

    /** Lời xin đang chờ mà người đang đăng nhập (chủ sở hữu) cần trả lời, mới nhất trước. */
    List<OfficialRequestResponse> getMine();

    /** Chủ sở hữu đồng ý: sao chép bản nhạc vào kho mẫu và báo cho quản trị viên đã xin. */
    OfficialRequestResponse accept(String requestId);

    /** Chủ sở hữu từ chối: không sao chép gì, báo cho quản trị viên đã xin. */
    OfficialRequestResponse decline(String requestId);

    /** ADMIN: rút lại lời xin đang chờ. */
    OfficialRequestResponse cancel(String requestId);

    /** ADMIN: mọi lời xin, lọc theo trạng thái (null hoặc rỗng là không lọc), mới nhất trước. */
    PageResponse<OfficialRequestResponse> getForAdmin(int page, int size, String status);
}
