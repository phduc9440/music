package com.ptit.music_be.service.impl;

import com.ptit.music_be.dto.response.UserResponse;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.mapper.MemberMapper;
import com.ptit.music_be.repository.UserRepository;
import com.ptit.music_be.service.UserService;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class UserServiceImpl implements UserService {

	UserRepository userRepository;
	MemberMapper memberMapper;

	@Override
	public UserResponse getMyInfo() {
		String username = SecurityContextHolder.getContext().getAuthentication().getName();

		return userRepository
				.findByUsername(username)
				.map(memberMapper::toUserResponse)
				.orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
	}
}
