package com.ptit.music_be.service.impl;

import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import com.ptit.music_be.dto.response.MemberResponse;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.mapper.MemberMapper;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.service.MemberService;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class MemberServiceImpl implements MemberService {

    MemberRepository memberRepository;
    MemberMapper memberMapper;

    @Override
    public MemberResponse getMyInfo() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();

        return memberRepository
                .findByEmail(email)
                .map(memberMapper::toMemberResponse)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
    }
}
