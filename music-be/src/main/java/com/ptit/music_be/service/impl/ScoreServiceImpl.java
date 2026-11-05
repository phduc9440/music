package com.ptit.music_be.service.impl;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;

import com.ptit.music_be.dto.enums.AiTaskStatus;
import com.ptit.music_be.dto.enums.DifficultyLevel;
import com.ptit.music_be.dto.enums.FileType;
import com.ptit.music_be.dto.enums.ProcessingStatus;
import com.ptit.music_be.dto.enums.ScoreSource;
import com.ptit.music_be.dto.request.ScoreUpdateRequest;
import com.ptit.music_be.dto.response.AiTaskResponse;
import com.ptit.music_be.dto.response.PageResponse;
import com.ptit.music_be.dto.response.ScoreDetailResponse;
import com.ptit.music_be.dto.response.ScoreSummaryResponse;
import com.ptit.music_be.dto.response.TagResponse;
import com.ptit.music_be.entity.AiTask;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.entity.ScoreTag;
import com.ptit.music_be.entity.Tag;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.mapper.AiTaskMapper;
import com.ptit.music_be.mapper.ScoreFileMapper;
import com.ptit.music_be.repository.AiTaskRepository;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.ScoreFileRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.repository.ScoreTagRepository;
import com.ptit.music_be.repository.TagRepository;
import com.ptit.music_be.service.FileStorageService;
import com.ptit.music_be.service.ScoreFileService;
import com.ptit.music_be.service.ScoreService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class ScoreServiceImpl implements ScoreService {

    static final int DEFAULT_PAGE_SIZE = 12;
    static final int MAX_PAGE_SIZE = 50;
    static final int MAX_KEYWORD_LENGTH = 100;
    static final int MAX_TAGS_PER_SCORE = 10;

    MemberRepository memberRepository;
    ScoreRepository scoreRepository;
    ScoreFileRepository scoreFileRepository;
    AiTaskRepository aiTaskRepository;
    TagRepository tagRepository;
    ScoreTagRepository scoreTagRepository;
    ScoreFileService scoreFileService;
    FileStorageService fileStorageService;
    ScoreFileMapper scoreFileMapper;
    AiTaskMapper aiTaskMapper;

    // ------------------------------------------------------------------ danh sách

    @Override
    @Transactional(readOnly = true)
    public PageResponse<ScoreSummaryResponse> getMyScores(
            int page, int size, String keyword, String status, String source, String difficulty, String tagId, String sort) {
        Member member = memberRepository
                .findByEmail(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));

        // Chuẩn hóa tham số: page >= 0, 1 <= size <= 50, keyword đã trim và cắt tối đa 100 ký tự
        int safePage = Math.max(page, 0);
        int safeSize = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
        String safeKeyword = normalizeKeyword(keyword);
        // Giá trị lọc sai (ví dụ status=ABC) thì báo lỗi 2020 thay vì âm thầm bỏ qua
        String safeStatus = parseEnumName(status, ProcessingStatus.class);
        String safeSource = parseEnumName(source, ScoreSource.class);
        String safeDifficulty = parseEnumName(difficulty, DifficultyLevel.class);
        String safeTagId = tagId == null ? "" : tagId.trim();

        PageRequest pageable = PageRequest.of(safePage, safeSize, toSort(sort));
        Page<Score> result =
                scoreRepository.searchOfMember(
                        member.getId(), safeKeyword, safeStatus, safeSource, safeDifficulty, safeTagId, pageable);

        Map<String, ScoreFile> thumbnails = loadThumbnails(result.getContent());
        Map<String, List<TagResponse>> tagsByScore = loadTags(result.getContent());
        List<ScoreSummaryResponse> content = result.getContent().stream()
                .map(score -> toSummary(
                        score, thumbnails.get(score.getId()), tagsByScore.getOrDefault(score.getId(), List.of())))
                .toList();

        return PageResponse.<ScoreSummaryResponse>builder()
                .content(content)
                .pageNumber(result.getNumber())
                .pageSize(result.getSize())
                .totalElements(result.getTotalElements())
                .totalPages(result.getTotalPages())
                .build();
    }

    // ------------------------------------------------------------------ chi tiết

    @Override
    @Transactional(readOnly = true)
    public ScoreDetailResponse getScore(String scoreId) {
        Score score = findScore(scoreId);
        scoreFileService.checkCanView(score);
        return toDetail(score);
    }

    // ------------------------------------------------------------------ sửa thông tin

    @Override
    @Transactional
    public ScoreDetailResponse updateScore(String scoreId, ScoreUpdateRequest request) {
        Score score = findScore(scoreId);
        scoreFileService.checkCanEdit(score);

        // PATCH: trường nào null thì giữ nguyên
        if (request.getTitle() != null) {
            String title = request.getTitle().trim();
            if (title.isEmpty()) {
                throw new AppException(ErrorCode.SCORE_TITLE_INVALID);
            }
            score.setTitle(title);
        }
        if (request.getComposer() != null) {
            score.setComposer(blankToNull(request.getComposer()));
        }
        if (request.getStudyNotes() != null) {
            score.setStudyNotes(blankToNull(request.getStudyNotes()));
        }
        if (request.getDifficulty() != null) {
            score.setDifficulty(request.getDifficulty());
        }
        if (request.getVisibility() != null) {
            score.setVisibility(request.getVisibility().name());
        }

        return toDetail(scoreRepository.save(score));
    }

    // ------------------------------------------------------------------ thể loại (tags)

    @Override
    @Transactional
    public ScoreDetailResponse updateTags(String scoreId, List<String> tagIds) {
        Score score = findScore(scoreId);
        scoreFileService.checkCanEdit(score);

        Set<String> wanted = new LinkedHashSet<>(tagIds == null ? List.of() : tagIds);
        if (wanted.size() > MAX_TAGS_PER_SCORE) {
            throw new AppException(ErrorCode.TOO_MANY_TAGS);
        }
        Map<String, Tag> found =
                tagRepository.findAllById(wanted).stream().collect(Collectors.toMap(Tag::getId, t -> t));
        if (found.size() != wanted.size()) {
            throw new AppException(ErrorCode.TAG_NOT_EXISTED);
        }

        // Chỉ xóa tag không còn được chọn và thêm tag mới, tag giữ nguyên thì không đụng tới (orphanRemoval lo việc xóa)
        score.getScoreTags().removeIf(st -> !wanted.contains(st.getTag().getId()));
        Set<String> have =
                score.getScoreTags().stream().map(st -> st.getTag().getId()).collect(Collectors.toSet());
        for (String id : wanted) {
            if (!have.contains(id)) {
                score.getScoreTags()
                        .add(ScoreTag.builder().score(score).tag(found.get(id)).build());
            }
        }
        return toDetail(scoreRepository.save(score));
    }

    private Map<String, List<TagResponse>> loadTags(Collection<Score> scores) {
        Map<String, List<TagResponse>> result = new HashMap<>();
        if (scores.isEmpty()) {
            return result;
        }
        List<String> ids = scores.stream().map(Score::getId).toList();
        for (ScoreTag st : scoreTagRepository.findByScoreIdInFetchTag(ids)) {
            result.computeIfAbsent(st.getScore().getId(), k -> new java.util.ArrayList<>())
                    .add(toTagResponse(st.getTag()));
        }
        result.values()
                .forEach(list ->
                        list.sort(java.util.Comparator.comparing(TagResponse::getName, String.CASE_INSENSITIVE_ORDER)));
        return result;
    }

    private static TagResponse toTagResponse(Tag tag) {
        return TagResponse.builder()
                .id(tag.getId())
                .name(tag.getName())
                .slug(tag.getSlug())
                .build();
    }

    // ------------------------------------------------------------------ xóa

    @Override
    @Transactional
    public void deleteScore(String scoreId) {
        Score score = findScore(scoreId);
        if (!scoreFileService.canDelete(score)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
        // Đang có tác vụ chạy thì không cho xóa (worker/AI service còn đang ghi file vào thư mục của score)
        if (aiTaskRepository.existsByScoreIdAndStatusIn(
                scoreId, List.of(AiTaskStatus.PENDING, AiTaskStatus.PROCESSING))) {
            throw new AppException(ErrorCode.SCORE_BUSY);
        }

        // score_files và ai_tasks bị xóa theo bằng ON DELETE CASCADE ở mức DB (@OnDelete trên entity)
        scoreRepository.delete(score);

        // Chỉ xóa file trên đĩa SAU KHI commit thành công, tránh mất file mà DB lại rollback
        String scoreDir = "scores/" + scoreId;
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                fileStorageService.deleteDirectory(scoreDir);
            }
        });
    }

    // ------------------------------------------------------------------ helpers

    private Score findScore(String scoreId) {
        return scoreRepository.findById(scoreId).orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
    }

    private ScoreSummaryResponse toSummary(Score score, ScoreFile thumbnail, List<TagResponse> tags) {
        return ScoreSummaryResponse.builder()
                .id(score.getId())
                .title(score.getTitle())
                .composer(score.getComposer())
                .difficulty(score.getDifficulty())
                .processingStatus(score.getProcessingStatus())
                .sourceType(score.getSourceType())
                .visibility(score.getVisibility())
                .measureCount(score.getMeasureCount())
                .tags(tags)
                .thumbnailUrl(thumbnail == null ? null : "/api/files/" + thumbnail.getId() + "/download?inline=true")
                .createdAt(score.getCreatedAt())
                .updatedAt(score.getUpdatedAt())
                .build();
    }

    private ScoreDetailResponse toDetail(Score score) {
        // Chỉ hiện các file hiện hành (is_current null coi như hiện hành, vì dữ liệu cũ chưa có cột này)
        List<ScoreFile> currentFiles =
                scoreFileRepository.findByScoreIdOrderByFileTypeAscPageNumberAsc(score.getId()).stream()
                        .filter(f -> f.getIsCurrent() == null || f.getIsCurrent())
                        .toList();

        // Task mới nhất của mỗi loại: danh sách đã sắp xếp mới -> cũ nên lấy phần tử đầu tiên của từng loại
        Map<Object, AiTask> latestByType = new LinkedHashMap<>();
        for (AiTask task : aiTaskRepository.findByScoreIdOrderByCreatedAtDesc(score.getId())) {
            latestByType.putIfAbsent(task.getTaskType(), task);
        }
        List<AiTaskResponse> latestTasks =
                latestByType.values().stream().map(aiTaskMapper::toResponse).toList();

        return ScoreDetailResponse.builder()
                .id(score.getId())
                .title(score.getTitle())
                .composer(score.getComposer())
                .difficulty(score.getDifficulty())
                .studyNotes(score.getStudyNotes())
                .processingStatus(score.getProcessingStatus())
                .rejectReason(score.getRejectReason())
                .sourceType(score.getSourceType())
                .visibility(score.getVisibility())
                .isOfficial(score.getIsOfficial())
                .tags(score.getScoreTags().stream()
                        .map(ScoreTag::getTag)
                        .map(ScoreServiceImpl::toTagResponse)
                        .sorted(java.util.Comparator.comparing(TagResponse::getName, String.CASE_INSENSITIVE_ORDER))
                        .toList())
                .keySignature(score.getKeySignature())
                .timeSignature(score.getTimeSignature())
                .tempoBpm(score.getTempoBpm())
                .measureCount(score.getMeasureCount())
                .staffCount(score.getStaffCount())
                .pageCount(score.getPageCount())
                .currentVersion(score.getCurrentVersion())
                .viewCount(score.getViewCount())
                .ownerEmail(score.getMember() == null ? null : score.getMember().getEmail())
                .canEdit(scoreFileService.canEdit(score))
                .canDelete(scoreFileService.canDelete(score))
                .createdAt(score.getCreatedAt())
                .updatedAt(score.getUpdatedAt())
                .files(scoreFileMapper.toResponses(currentFiles))
                .latestTasks(latestTasks)
                .build();
    }

    /**
     * Ảnh đại diện của mỗi bản nhạc = ảnh trang 1. Ưu tiên ảnh đã tiền xử lý (PNG), không có thì dùng ảnh gốc
     * (ORIGINAL_IMAGE). Bản nhạc tải lên bằng PDF chưa có ảnh trang nào thì không có ảnh đại diện (null).
     */
    private Map<String, ScoreFile> loadThumbnails(Collection<Score> scores) {
        Map<String, ScoreFile> result = new HashMap<>();
        if (scores.isEmpty()) {
            return result;
        }
        List<String> ids = scores.stream().map(Score::getId).toList();
        List<ScoreFile> files = scoreFileRepository.findByScoreIdInAndFileTypeInAndPageNumber(
                ids, List.of(FileType.PNG, FileType.ORIGINAL_IMAGE), 1);
        for (ScoreFile file : files) {
            ScoreFile existing = result.get(file.getScore().getId());
            if (existing == null || file.getFileType() == FileType.PNG) {
                result.put(file.getScore().getId(), file);
            }
        }
        return result;
    }

    private static String normalizeKeyword(String keyword) {
        if (!StringUtils.hasText(keyword)) {
            return "";
        }
        String trimmed = keyword.trim();
        return trimmed.length() > MAX_KEYWORD_LENGTH ? trimmed.substring(0, MAX_KEYWORD_LENGTH) : trimmed;
    }

    /** Rỗng -> "" (không lọc); đúng tên enum -> trả tên đó; sai -> INVALID_FILTER. */
    private static <E extends Enum<E>> String parseEnumName(String value, Class<E> type) {
        if (!StringUtils.hasText(value)) {
            return "";
        }
        try {
            return Enum.valueOf(type, value.trim().toUpperCase(Locale.ROOT)).name();
        } catch (IllegalArgumentException e) {
            throw new AppException(ErrorCode.INVALID_FILTER);
        }
    }

    private static Sort toSort(String sort) {
        String key = sort == null ? "newest" : sort.trim().toLowerCase(Locale.ROOT);
        return switch (key) {
            case "created" -> Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id"));
            case "oldest" -> Sort.by(Sort.Order.asc("createdAt"), Sort.Order.asc("id"));
            case "title" -> Sort.by(Sort.Order.asc("title").ignoreCase(), Sort.Order.asc("id"));
                // Mặc định (và mọi giá trị lạ): cập nhật gần nhất trước
            default -> Sort.by(Sort.Order.desc("updatedAt"), Sort.Order.desc("id"));
        };
    }

    private static String blankToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }
}
