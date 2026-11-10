package com.ptit.music_be.service.impl;

import java.text.Normalizer;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.request.TagRequest;
import com.ptit.music_be.dto.response.AdminTagResponse;
import com.ptit.music_be.entity.Tag;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.ScoreTagRepository;
import com.ptit.music_be.repository.TagRepository;
import com.ptit.music_be.service.AdminTagService;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class AdminTagServiceImpl implements AdminTagService {

    static int MAX_NAME = 50;

    TagRepository tagRepository;
    ScoreTagRepository scoreTagRepository;

    @Override
    @Transactional(readOnly = true)
    public List<AdminTagResponse> getTags() {
        Map<String, Long> counts = new HashMap<>();
        for (Object[] row : scoreTagRepository.countGroupedByTag()) {
            counts.put((String) row[0], ((Number) row[1]).longValue());
        }
        return tagRepository.findAll(Sort.by("name")).stream()
                .map(t -> toResponse(t, counts.getOrDefault(t.getId(), 0L)))
                .toList();
    }

    @Override
    @Transactional
    public AdminTagResponse create(TagRequest request) {
        String name = cleanName(request);
        String slug = slugify(name);
        if (slug.isEmpty()) {
            throw new AppException(ErrorCode.TAG_NAME_INVALID);
        }
        // name/slug đều UNIQUE và so sánh không phân biệt hoa thường, không phân biệt dấu (Pop = pop, Cổ điển = Co
        // dien)
        if (tagRepository.existsByName(name) || tagRepository.existsBySlug(slug)) {
            throw new AppException(ErrorCode.TAG_DUPLICATED);
        }
        Tag saved = tagRepository.save(Tag.builder().name(name).slug(slug).build());
        return toResponse(saved, 0);
    }

    @Override
    @Transactional
    public AdminTagResponse update(String id, TagRequest request) {
        Tag tag = findTag(id);
        String name = cleanName(request);
        String slug = slugify(name);
        if (slug.isEmpty()) {
            throw new AppException(ErrorCode.TAG_NAME_INVALID);
        }
        if (tagRepository.existsByNameIgnoreCaseAndIdNot(name, id) || tagRepository.existsBySlugAndIdNot(slug, id)) {
            throw new AppException(ErrorCode.TAG_DUPLICATED);
        }
        tag.setName(name);
        tag.setSlug(slug);
        Tag saved = tagRepository.save(tag);
        return toResponse(saved, scoreTagRepository.countByTag(saved));
    }

    @Override
    @Transactional
    public void delete(String id) {
        // Tag.scoreTags có cascade ALL + orphanRemoval nên các dòng score_tags bị xóa theo
        tagRepository.delete(findTag(id));
    }

    private Tag findTag(String id) {
        return tagRepository.findById(id).orElseThrow(() -> new AppException(ErrorCode.TAG_NOT_EXISTED));
    }

    private static String cleanName(TagRequest request) {
        String name = request == null || request.getName() == null
                ? ""
                : request.getName().trim();
        // Gộp nhiều khoảng trắng liên tiếp thành một
        name = name.replaceAll("\\s+", " ");
        if (name.isEmpty() || name.length() > MAX_NAME) {
            throw new AppException(ErrorCode.TAG_NAME_INVALID);
        }
        return name;
    }

    /** "Cổ điển" -> "co-dien": bỏ dấu tiếng Việt, chữ thường, ký tự không phải chữ/số thành dấu gạch ngang. */
    static String slugify(String name) {
        String s = Normalizer.normalize(name, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .replace('đ', 'd')
                .replace('Đ', 'D')
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-");
        return s.replaceAll("^-+|-+$", "");
    }

    private static AdminTagResponse toResponse(Tag t, long scoreCount) {
        return AdminTagResponse.builder()
                .id(t.getId())
                .name(t.getName())
                .slug(t.getSlug())
                .scoreCount(scoreCount)
                .build();
    }
}
