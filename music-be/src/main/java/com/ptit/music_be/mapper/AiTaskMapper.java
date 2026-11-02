package com.ptit.music_be.mapper;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

import com.ptit.music_be.dto.response.AiTaskResponse;
import com.ptit.music_be.entity.AiTask;

@Mapper(componentModel = "spring")
public interface AiTaskMapper {

    @Mapping(target = "scoreId", source = "score.id")
    AiTaskResponse toResponse(AiTask aiTask);
}
