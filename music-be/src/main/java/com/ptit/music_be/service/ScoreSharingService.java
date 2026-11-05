package com.ptit.music_be.service;

import java.util.List;

import com.ptit.music_be.dto.enums.SharePermission;
import com.ptit.music_be.dto.response.AccessRequestResponse;
import com.ptit.music_be.dto.response.MyAccessResponse;
import com.ptit.music_be.dto.response.ScoreSharingResponse;
import com.ptit.music_be.dto.response.SharedJoinResponse;

/** Chia sẻ bản nhạc: liên kết "bất kỳ ai có liên kết" và quản lý người được chia sẻ. */
public interface ScoreSharingService {

    /** Chủ sở hữu hoặc ADMIN xem trạng thái chia sẻ. */
    ScoreSharingResponse getSharing(String scoreId);

    /**
     * Bật, đổi cấp hoặc tắt (permission = null) chia sẻ bằng liên kết. Tắt thì thu hồi mọi quyền đã cấp qua liên kết;
     * đổi cấp thì cập nhật cấp của những người đã vào bằng liên kết.
     */
    ScoreSharingResponse setLink(String scoreId, SharePermission permission);

    /** Tạo liên kết mới: liên kết cũ vô hiệu và quyền cấp qua liên kết cũ bị thu hồi. */
    ScoreSharingResponse resetLink(String scoreId);

    /** Mời trực tiếp một người theo email với một cấp quyền (đã có thì đổi cấp). */
    ScoreSharingResponse addMember(String scoreId, String email, SharePermission permission);

    ScoreSharingResponse updateMember(String scoreId, String memberId, SharePermission permission);

    ScoreSharingResponse removeMember(String scoreId, String memberId);

    /**
     * Người dùng xin quyền (xem / nhận xét / chỉnh sửa) một bản nhạc. Yêu cầu được ghi vào dòng member_scores của họ
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

    /** Người đăng nhập mở liên kết: nhận quyền theo cấp của liên kết (quyền cao hơn đã có thì giữ nguyên). */
    SharedJoinResponse joinByToken(String token);
}
