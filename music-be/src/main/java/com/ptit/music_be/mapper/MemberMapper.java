package com.ptit.music_be.mapper;

import org.mapstruct.*;

import com.ptit.music_be.dto.request.AccountCreationRequest;
import com.ptit.music_be.dto.request.AccountUpdateRequest;
import com.ptit.music_be.dto.response.AdminResponse;
import com.ptit.music_be.dto.response.MemberResponse;
import com.ptit.music_be.dto.response.UserResponse;
import com.ptit.music_be.entity.Admin;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.User;

@Mapper(componentModel = "spring")
public interface MemberMapper {

    MemberResponse toMemberResponse(Member member);

    AdminResponse toAdminResponse(Admin admin);

    UserResponse toUserResponse(User user);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "role", constant = "ADMIN")
    Admin toAdmin(AccountCreationRequest request);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "username", ignore = true)
    @Mapping(target = "password", ignore = true)
    @Mapping(target = "role", ignore = true)
    @BeanMapping(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
    void updateAdmin(@MappingTarget Admin admin, AccountUpdateRequest request);
}
