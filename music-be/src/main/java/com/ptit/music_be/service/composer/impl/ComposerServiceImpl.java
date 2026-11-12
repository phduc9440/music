package com.ptit.music_be.service.composer.impl;

import java.time.Year;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.ptit.music_be.dto.enums.composer.ComposerPeriod;
import com.ptit.music_be.dto.request.composer.ComposerRequest;
import com.ptit.music_be.dto.response.composer.ComposerResponse;
import com.ptit.music_be.entity.Composer;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.composer.ComposerRepository;
import com.ptit.music_be.service.composer.ComposerMatcher;
import com.ptit.music_be.service.composer.ComposerService;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class ComposerServiceImpl implements ComposerService {

    static final int MAX_NAME = 255;
    static final int MAX_ALIASES = 500;
    static final int MAX_COUNTRY = 100;
    static final int MAX_BIO = 4000;
    static final int MAX_URL = 1000;
    static final int MAX_LICENSE = 100;
    static final int MAX_KEYWORD = 100;
    static final int MAX_LIMIT = 100;
    static final int TOP_TITLES = 3;

    private final ComposerRepository composerRepository;
    private final ComposerMatcher composerMatcher;

    @Override
    @Transactional(readOnly = true)
    public List<ComposerResponse> listPublic(String keyword, String period, int limit) {
        int safeLimit = limit <= 0 ? MAX_LIMIT : Math.min(limit, MAX_LIMIT);
        List<ComposerResponse> result = new ArrayList<>();
        for (Object[] row : composerRepository.searchWithPublicCount(
                normalizeKeyword(keyword), parsePeriod(period), PageRequest.of(0, safeLimit))) {
            Composer c = (Composer) row[0];
            long count = ((Number) row[1]).longValue();
            ComposerResponse response = toResponse(c, count);
            response.setTopTitles(
                    count == 0
                            ? List.of()
                            : composerRepository.publicTitlesOf(c.getId(), PageRequest.of(0, TOP_TITLES)));
            result.add(response);
        }
        return result;
    }

    @Override
    @Transactional(readOnly = true)
    public ComposerResponse getBySlug(String slug) {
        Composer c = composerRepository
                .findBySlug(slug == null ? "" : slug.trim().toLowerCase(Locale.ROOT))
                .orElseThrow(() -> new AppException(ErrorCode.COMPOSER_NOT_EXISTED));
        List<String> titles = composerRepository.publicTitlesOf(c.getId(), PageRequest.of(0, TOP_TITLES));
        ComposerResponse response = toResponse(c, 0);
        response.setTopTitles(titles);
        return response;
    }

    @Override
    @Transactional(readOnly = true)
    public List<ComposerResponse> listForAdmin() {
        return composerRepository.findAllWithScoreCount().stream()
                .map(row -> toResponse((Composer) row[0], ((Number) row[1]).longValue()))
                .toList();
    }

    @Override
    @Transactional
    public ComposerResponse create(ComposerRequest request) {
        Composer c = new Composer();
        apply(c, request);
        if (composerRepository.existsBySlug(c.getSlug())) {
            throw new AppException(ErrorCode.COMPOSER_DUPLICATED);
        }
        Composer saved = composerRepository.saveAndFlush(c);
        relink(saved.getId());
        return toResponse(saved, countLinked(saved.getId()));
    }

    @Override
    @Transactional
    public ComposerResponse update(String id, ComposerRequest request) {
        Composer c = find(id);
        apply(c, request);
        if (composerRepository.existsBySlugAndIdNot(c.getSlug(), id)) {
            throw new AppException(ErrorCode.COMPOSER_DUPLICATED);
        }
        Composer saved = composerRepository.saveAndFlush(c);
        relink(saved.getId());
        return toResponse(saved, countLinked(saved.getId()));
    }

    @Override
    @Transactional
    public void delete(String id) {
        Composer c = find(id);
        // Khóa ngoại SET NULL bỏ liên kết của các bản nhạc; sau đó cho các bản đó cơ hội khớp nhạc sĩ khác
        composerRepository.delete(c);
        composerRepository.flush();
        relink(id);
    }

    @Override
    @Transactional
    public int relinkAll() {
        composerMatcher.invalidate();
        return applyLinks(composerRepository.findAllWithComposerText());
    }

    /** Danh sách nhạc sĩ vừa đổi: tính lại liên kết cho bản chưa gắn và bản đang gắn với nhạc sĩ này. */
    private void relink(String composerId) {
        composerMatcher.invalidate();
        applyLinks(composerRepository.findRelinkCandidates(composerId));
    }

    /**
     * Cập nhật hàng loạt (không qua entity) để không làm đổi "cập nhật lần cuối" của bản nhạc, vì chủ bản không sửa gì.
     */
    private int applyLinks(List<Score> scores) {
        Map<String, List<String>> idsByComposer = new HashMap<>();
        List<String> toUnlink = new ArrayList<>();
        for (Score s : scores) {
            String target = composerMatcher.match(s.getComposer());
            if (Objects.equals(target, s.getComposerId())) {
                continue;
            }
            if (target == null) {
                toUnlink.add(s.getId());
            } else {
                idsByComposer.computeIfAbsent(target, k -> new ArrayList<>()).add(s.getId());
            }
        }
        int changed = 0;
        for (Map.Entry<String, List<String>> e : idsByComposer.entrySet()) {
            changed += composerRepository.setComposerId(e.getKey(), e.getValue());
        }
        if (!toUnlink.isEmpty()) {
            changed += composerRepository.clearComposerId(toUnlink);
        }
        return changed;
    }

    private long countLinked(String composerId) {
        return composerRepository.countByLinkedScores(composerId);
    }

    private Composer find(String id) {
        return composerRepository.findById(id).orElseThrow(() -> new AppException(ErrorCode.COMPOSER_NOT_EXISTED));
    }

    private static void apply(Composer c, ComposerRequest r) {
        String name = trim(r.getName());
        if (name == null || name.length() > MAX_NAME) {
            throw new AppException(ErrorCode.COMPOSER_NAME_INVALID);
        }
        String slug = ComposerMatcher.slugify(name);
        if (slug.isEmpty()) {
            throw new AppException(ErrorCode.COMPOSER_NAME_INVALID);
        }
        if (slug.length() > 120) {
            slug = slug.substring(0, 120).replaceAll("-+$", "");
        }

        int thisYear = Year.now().getValue();
        Integer birth = r.getBirthYear();
        Integer death = r.getDeathYear();
        if ((birth != null && (birth < 1 || birth > thisYear))
                || (death != null && (death < 1 || death > thisYear))
                || (birth != null && death != null && death < birth)) {
            throw new AppException(ErrorCode.COMPOSER_YEARS_INVALID);
        }

        String imageUrl = trim(r.getImageUrl());
        String imageSource = trim(r.getImageSource());
        String imageLicense = trim(r.getImageLicense());
        if (imageUrl != null
                && (!imageUrl.startsWith("https://")
                        || imageSource == null
                        || !(imageSource.startsWith("https://") || imageSource.startsWith("http://"))
                        || imageLicense == null)) {
            throw new AppException(ErrorCode.COMPOSER_IMAGE_INVALID);
        }

        c.setName(name);
        c.setSlug(slug);
        c.setAliases(limit(normalizeAliases(r.getAliases()), MAX_ALIASES));
        c.setBirthYear(birth);
        c.setDeathYear(death);
        c.setCountry(limit(trim(r.getCountry()), MAX_COUNTRY));
        c.setPeriod(r.getPeriod() == null ? null : r.getPeriod().name());
        c.setBio(limit(trim(r.getBio()), MAX_BIO));
        c.setImageUrl(limit(imageUrl, MAX_URL));
        c.setImageSource(imageUrl == null ? null : limit(imageSource, MAX_URL));
        c.setImageLicense(imageUrl == null ? null : limit(imageLicense, MAX_LICENSE));
    }

    /** "Bach ,  J.S. Bach,," → "Bach, J.S. Bach". */
    private static String normalizeAliases(String aliases) {
        if (!StringUtils.hasText(aliases)) {
            return null;
        }
        List<String> parts = new ArrayList<>();
        for (String a : aliases.split(",")) {
            String t = a.trim();
            if (!t.isEmpty() && !parts.contains(t)) {
                parts.add(t);
            }
        }
        return parts.isEmpty() ? null : String.join(", ", parts);
    }

    private static String limit(String value, int max) {
        if (value != null && value.length() > max) {
            throw new AppException(ErrorCode.COMPOSER_FIELD_TOO_LONG);
        }
        return value;
    }

    private static String trim(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private static String parsePeriod(String period) {
        if (!StringUtils.hasText(period)) {
            return "";
        }
        try {
            return ComposerPeriod.valueOf(period.trim().toUpperCase(Locale.ROOT))
                    .name();
        } catch (IllegalArgumentException e) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
    }

    private static String normalizeKeyword(String keyword) {
        if (!StringUtils.hasText(keyword)) {
            return "";
        }
        String t = keyword.trim();
        t = t.length() > MAX_KEYWORD ? t.substring(0, MAX_KEYWORD) : t;
        return t.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private static ComposerResponse toResponse(Composer c, long scoreCount) {
        return ComposerResponse.builder()
                .id(c.getId())
                .name(c.getName())
                .slug(c.getSlug())
                .aliases(c.getAliases())
                .birthYear(c.getBirthYear())
                .deathYear(c.getDeathYear())
                .country(c.getCountry())
                .period(c.getPeriod())
                .bio(c.getBio())
                .imageUrl(c.getImageUrl())
                .imageSource(c.getImageSource())
                .imageLicense(c.getImageLicense())
                .scoreCount(scoreCount)
                .build();
    }
}
