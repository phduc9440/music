package com.ptit.music_be.service.auth;

import org.springframework.web.multipart.MultipartFile;

import com.ptit.music_be.dto.request.auth.UpdateLocaleRequest;
import com.ptit.music_be.dto.request.auth.UpdateProfileRequest;
import com.ptit.music_be.dto.request.auth.UpdateThemeRequest;
import com.ptit.music_be.dto.response.auth.MemberResponse;

public interface MemberService {

    MemberResponse getMyInfo();

    MemberResponse updateMyProfile(UpdateProfileRequest request);

    /** Lưu giao diện sáng/tối/theo hệ thống đã chọn để đồng bộ giữa các máy. */
    MemberResponse updateMyTheme(UpdateThemeRequest request);

    /** Lưu ngôn ngữ giao diện (VI / EN) để đi theo tài khoản giữa các máy. */
    MemberResponse updateMyLocale(UpdateLocaleRequest request);

    MemberResponse uploadAvatar(MultipartFile file);

    MemberResponse deleteAvatar();
}
