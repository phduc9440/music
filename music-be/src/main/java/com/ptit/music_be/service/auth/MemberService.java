package com.ptit.music_be.service.auth;

import org.springframework.web.multipart.MultipartFile;

import com.ptit.music_be.dto.request.UpdateProfileRequest;
import com.ptit.music_be.dto.request.UpdateThemeRequest;
import com.ptit.music_be.dto.response.MemberResponse;

public interface MemberService {

    MemberResponse getMyInfo();

    MemberResponse updateMyProfile(UpdateProfileRequest request);

    /** Lưu giao diện sáng/tối/theo hệ thống đã chọn để đồng bộ giữa các máy. */
    MemberResponse updateMyTheme(UpdateThemeRequest request);

    MemberResponse uploadAvatar(MultipartFile file);

    MemberResponse deleteAvatar();
}
