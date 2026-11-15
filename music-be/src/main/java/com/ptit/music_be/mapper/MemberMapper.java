package com.ptit.music_be.mapper;

import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import org.mapstruct.*;

import com.ptit.music_be.configuration.RolePermissionRegistry;
import com.ptit.music_be.dto.enums.auth.AdminPermission;
import com.ptit.music_be.dto.response.auth.MemberResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.MemberRole;

@Mapper(componentModel = "spring")
public interface MemberMapper {

    @Mapping(target = "roles", source = "memberRoles", qualifiedByName = "mapRoles")
    @Mapping(target = "permissions", source = "memberRoles", qualifiedByName = "mapPermissions")
    @Mapping(target = "plan", ignore = true)
    MemberResponse toMemberResponse(Member member);

    @Named("mapPermissions")
    default Set<AdminPermission> mapPermissions(List<MemberRole> memberRoles) {
        return RolePermissionRegistry.permissionsOf(mapRoles(memberRoles));
    }

    @Named("mapRoles")
    default Set<String> mapRoles(List<MemberRole> memberRoles) {
        if (memberRoles == null) {
            return Collections.emptySet();
        }
        return memberRoles.stream()
                .filter(ur -> ur.getRole() != null)
                .map(ur -> ur.getRole().getName())
                .collect(Collectors.toSet());
    }
}
