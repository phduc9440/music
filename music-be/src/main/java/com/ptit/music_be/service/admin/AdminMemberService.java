package com.ptit.music_be.service.admin;

import com.ptit.music_be.dto.request.AdminUpdateMemberRequest;
import com.ptit.music_be.dto.response.AdminMemberDetailResponse;
import com.ptit.music_be.dto.response.MemberResponse;
import com.ptit.music_be.dto.response.PageResponse;

public interface AdminMemberService {

    PageResponse<MemberResponse> getMembers(int page, int size, String keyword);

    /** Chỉ quản trị viên thường (ADMIN, không phải SUPER_ADMIN), kèm gói đang dùng: trang Tạm ngưng gói. */
    PageResponse<MemberResponse> getPlainAdmins(int page, int size, String keyword);

    MemberResponse getMember(String memberId);

    /** Hồ sơ cùng số bản nhạc, playlist, nhận xét, luyện tập và các bản nhạc gần đây của thành viên. */
    AdminMemberDetailResponse getMemberDetail(String memberId);

    MemberResponse updateMember(String memberId, AdminUpdateMemberRequest request);
}
