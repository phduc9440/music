package com.ptit.music_be.mapper;

import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import org.mapstruct.*;

import com.ptit.music_be.dto.response.UserResponse;
import com.ptit.music_be.entity.User;
import com.ptit.music_be.entity.UserRole;

@Mapper(componentModel = "spring")
public interface UserMapper {

    @Mapping(target = "roles", source = "userRoles", qualifiedByName = "mapRoles")
    UserResponse toUserResponse(User user);

    @Named("mapRoles")
    default Set<String> mapRoles(List<UserRole> userRoles) {
        if (userRoles == null) {
            return Collections.emptySet();
        }
        return userRoles.stream()
                .filter(ur -> ur.getRole() != null)
                .map(ur -> ur.getRole().getName())
                .collect(Collectors.toSet());
    }
}
