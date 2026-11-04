package com.ptit.music_be.converter;

import com.ptit.music_be.dto.enums.PracticeMode;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** Lưu {@link PracticeMode} xuống DB dưới dạng số. */
@Converter
public class PracticeModeConverter implements AttributeConverter<PracticeMode, Integer> {

    @Override
    public Integer convertToDatabaseColumn(PracticeMode attribute) {
        return attribute == null ? null : attribute.getCode();
    }

    @Override
    public PracticeMode convertToEntityAttribute(Integer dbData) {
        return dbData == null ? null : PracticeMode.fromCode(dbData);
    }
}
