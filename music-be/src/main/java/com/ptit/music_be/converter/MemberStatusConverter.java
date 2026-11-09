package com.ptit.music_be.converter;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import com.ptit.music_be.dto.enums.MemberStatus;

/** Lưu {@link MemberStatus} xuống DB dưới dạng số (1 = ACTIVE, 2 = INACTIVE). */
@Converter
public class MemberStatusConverter implements AttributeConverter<MemberStatus, Integer> {

    @Override
    public Integer convertToDatabaseColumn(MemberStatus attribute) {
        return attribute == null ? null : attribute.getCode();
    }

    @Override
    public MemberStatus convertToEntityAttribute(Integer dbData) {
        return dbData == null ? null : MemberStatus.fromCode(dbData);
    }
}
