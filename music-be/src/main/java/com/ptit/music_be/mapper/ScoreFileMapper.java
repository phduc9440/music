package com.ptit.music_be.mapper;

import java.util.List;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

import com.ptit.music_be.dto.response.ScoreFileResponse;
import com.ptit.music_be.entity.ScoreFile;

@Mapper(componentModel = "spring")
public interface ScoreFileMapper {

    @Mapping(target = "scoreId", source = "score.id")
    @Mapping(target = "downloadUrl", expression = "java(\"/api/files/\" + scoreFile.getId() + \"/download\")")
    ScoreFileResponse toResponse(ScoreFile scoreFile);

    List<ScoreFileResponse> toResponses(List<ScoreFile> scoreFiles);
}
