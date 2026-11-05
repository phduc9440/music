package com.ptit.music_be.service;

import com.ptit.music_be.dto.request.AdminUpdateMemberRequest;
import com.ptit.music_be.dto.response.MemberResponse;
import com.ptit.music_be.dto.response.PageResponse;

public interface AdminMemberService {

    PageResponse<MemberResponse> getMembers(int page, int size, String keyword);

    MemberResponse getMember(String memberId);

    MemberResponse updateMember(String memberId, AdminUpdateMemberRequest request);
}
