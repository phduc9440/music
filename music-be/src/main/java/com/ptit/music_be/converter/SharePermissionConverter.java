package com.ptit.music_be.converter;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import com.ptit.music_be.dto.enums.SharePermission;

/** Lưu {@link SharePermission} xuống DB dưới dạng số. */
@Converter
public class SharePermissionConverter implements AttributeConverter<SharePermission, Integer> {

    @Override
    public Integer convertToDatabaseColumn(SharePermission attribute) {
        return attribute == null ? null : attribute.getCode();
    }

    @Override
    public SharePermission convertToEntityAttribute(Integer dbData) {
        return dbData == null ? null : SharePermission.fromCode(dbData);
    }
}
