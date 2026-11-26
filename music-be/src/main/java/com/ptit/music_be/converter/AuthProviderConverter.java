package com.ptit.music_be.converter;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import com.ptit.music_be.dto.enums.auth.AuthProvider;

/** Lưu {@link AuthProvider} xuống DB dưới dạng số (1 = LOCAL, 2 = GOOGLE). */
@Converter
public class AuthProviderConverter implements AttributeConverter<AuthProvider, Integer> {

    @Override
    public Integer convertToDatabaseColumn(AuthProvider attribute) {
        return attribute == null ? null : attribute.getCode();
    }

    @Override
    public AuthProvider convertToEntityAttribute(Integer dbData) {
        return dbData == null ? null : AuthProvider.fromCode(dbData);
    }
}
