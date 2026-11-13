package com.ptit.music_be.service.admin;

import com.ptit.music_be.dto.request.admin.AdminUpdateMemberRequest;
import com.ptit.music_be.dto.response.admin.AdminMemberDetailResponse;
import com.ptit.music_be.dto.response.auth.MemberResponse;
import com.ptit.music_be.dto.response.common.PageResponse;

public interface AdminMemberService {

    PageResponse<MemberResponse> getMembers(int page, int size, String keyword);

    /**
     * Như {@link #getMembers}, lọc thêm theo gói đang dùng ({@code planCode}, PRO gồm cả ADMIN dùng Pro theo vai trò) và
     * chỉ người đang bị cấm ({@code bannedOnly}). Dùng ở trang Gói thành viên.
     */
    PageResponse<MemberResponse> getMembersWithPlan(
            int page, int size, String keyword, String planCode, boolean bannedOnly);

    MemberResponse getMember(String memberId);

    /** Hồ sơ cùng số bản nhạc, playlist, nhận xét, luyện tập và các bản nhạc gần đây của thành viên. */
    AdminMemberDetailResponse getMemberDetail(String memberId);

    MemberResponse updateMember(String memberId, AdminUpdateMemberRequest request);
}
