package com.ptit.music_be.service.auth.impl;

import java.io.IOException;
import java.io.InputStream;
import java.util.Map;
import java.util.Set;
import javax.imageio.ImageIO;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import com.ptit.music_be.dto.request.auth.UpdateLocaleRequest;
import com.ptit.music_be.dto.request.auth.UpdateProfileRequest;
import com.ptit.music_be.dto.request.auth.UpdateThemeRequest;
import com.ptit.music_be.dto.response.auth.MemberResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.mapper.MemberMapper;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.service.auth.MemberService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class MemberServiceImpl implements MemberService {

    static final long MAX_AVATAR_BYTES = 2L * 1024 * 1024;
    static final Set<String> ALLOWED_TYPES = Set.of("image/jpeg", "image/png");

    MemberRepository memberRepository;
    MemberMapper memberMapper;
    Cloudinary cloudinary;

    private Member currentMember() {
        return memberRepository
                .findByEmail(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
    }

    @Override
    public MemberResponse getMyInfo() {
        return memberMapper.toMemberResponse(currentMember());
    }

    @Override
    @Transactional
    public MemberResponse updateMyProfile(UpdateProfileRequest request) {
        Member member = currentMember();
        member.setFullName(request.getFullName().trim());
        member.setPhone(blankToNull(request.getPhone()));
        member.setAddress(blankToNull(request.getAddress()));
        return memberMapper.toMemberResponse(memberRepository.save(member));
    }

    @Override
    @Transactional
    public MemberResponse updateMyTheme(UpdateThemeRequest request) {
        Member member = currentMember();
        member.setUiTheme(request.getTheme());
        return memberMapper.toMemberResponse(memberRepository.save(member));
    }

    @Override
    @Transactional
    public MemberResponse updateMyLocale(UpdateLocaleRequest request) {
        Member member = currentMember();
        member.setLocale(request.getLocale());
        return memberMapper.toMemberResponse(memberRepository.save(member));
    }

    @Override
    @Transactional
    public MemberResponse uploadAvatar(MultipartFile file) {
        if (file == null || file.isEmpty() || file.getSize() > MAX_AVATAR_BYTES) {
            throw new AppException(ErrorCode.AVATAR_INVALID);
        }
        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_TYPES.contains(contentType)) {
            throw new AppException(ErrorCode.AVATAR_INVALID);
        }
        // Make sure the bytes really are a decodable image, not just a spoofed content type.
        try (InputStream in = file.getInputStream()) {
            if (ImageIO.read(in) == null) {
                throw new AppException(ErrorCode.AVATAR_INVALID);
            }
        } catch (IOException e) {
            throw new AppException(ErrorCode.AVATAR_INVALID);
        }

        Member member = currentMember();
        String url;
        try {
            // Fixed public id per member + overwrite: re-uploading replaces the old image.
            Map<?, ?> result = cloudinary
                    .uploader()
                    .upload(
                            file.getBytes(),
                            ObjectUtils.asMap(
                                    "public_id",
                                    publicId(member),
                                    "overwrite",
                                    true,
                                    "invalidate",
                                    true,
                                    "resource_type",
                                    "image"));
            url = (String) result.get("secure_url");
        } catch (Exception e) {
            throw new AppException(ErrorCode.FILE_STORAGE_ERROR);
        }
        // Cache-bust so browsers show the new image after an overwrite.
        member.setAvatarUrl(url + "?v=" + System.currentTimeMillis());
        return memberMapper.toMemberResponse(memberRepository.save(member));
    }

    @Override
    @Transactional
    public MemberResponse deleteAvatar() {
        Member member = currentMember();
        if (member.getAvatarUrl() != null) {
            try {
                cloudinary.uploader().destroy(publicId(member), ObjectUtils.asMap("invalidate", true));
            } catch (Exception e) {
                throw new AppException(ErrorCode.FILE_STORAGE_ERROR);
            }
            member.setAvatarUrl(null);
        }
        return memberMapper.toMemberResponse(memberRepository.save(member));
    }

    private static String publicId(Member member) {
        return "avatars/" + member.getId();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
