package com.ptit.music_be.service;

import org.springframework.web.multipart.MultipartFile;

import com.ptit.music_be.dto.request.UpdateProfileRequest;
import com.ptit.music_be.dto.response.MemberResponse;

public interface MemberService {

    MemberResponse getMyInfo();

    MemberResponse updateMyProfile(UpdateProfileRequest request);

    MemberResponse uploadAvatar(MultipartFile file);

    MemberResponse deleteAvatar();
}
