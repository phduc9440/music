package com.ptit.music_be.service.score;

import java.util.List;

import com.ptit.music_be.dto.enums.score.SharePermission;
import com.ptit.music_be.dto.response.score.AccessRequestResponse;
import com.ptit.music_be.dto.response.score.MyAccessResponse;
import com.ptit.music_be.dto.response.score.ScoreSharingResponse;

/** Chia sẻ bản nhạc: quản lý người được chia sẻ và yêu cầu xin quyền. */
public interface ScoreSharingService {

    /** Chủ sở hữu hoặc ADMIN xem trạng thái chia sẻ. */
    ScoreSharingResponse getSharing(String scoreId);

    /** Mời trực tiếp một người theo email với một cấp quyền (đã có thì đổi cấp). */
    ScoreSharingResponse addMember(String scoreId, String email, SharePermission permission);

    ScoreSharingResponse updateMember(String scoreId, String memberId, SharePermission permission);

    ScoreSharingResponse removeMember(String scoreId, String memberId);

    /**
     * Người dùng xin quyền (xem / chỉnh sửa) một bản nhạc. Yêu cầu được ghi vào dòng member_scores của họ
     * và chờ chủ sở hữu duyệt; xin lại thì cập nhật yêu cầu cũ.
     */
    MyAccessResponse requestAccess(String scoreId, SharePermission permission, String message);

    /** Quyền hiện có và yêu cầu đang chờ của người đang đăng nhập với bản nhạc (dùng cho màn hình "xin quyền"). */
    MyAccessResponse getMyAccess(String scoreId);

    /** Chủ sở hữu hoặc ADMIN: các yêu cầu xin quyền đang chờ. */
    List<AccessRequestResponse> getAccessRequests(String scoreId);

    /** Đồng ý: cấp {@code granted} (null = đúng cấp người ta xin) rồi xóa yêu cầu. */
    ScoreSharingResponse approveRequest(String scoreId, String memberId, SharePermission granted);

    /** Từ chối: xóa yêu cầu; người chưa có quyền gì thì xóa luôn dòng. */
    ScoreSharingResponse rejectRequest(String scoreId, String memberId);
}
