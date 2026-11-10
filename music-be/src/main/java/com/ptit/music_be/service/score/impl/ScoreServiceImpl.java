package com.ptit.music_be.service.score.impl;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.ptit.music_be.dto.enums.AiTaskStatus;
import com.ptit.music_be.dto.enums.DifficultyLevel;
import com.ptit.music_be.dto.enums.FileType;
import com.ptit.music_be.dto.enums.NotificationType;
import com.ptit.music_be.dto.enums.ProcessingStatus;
import com.ptit.music_be.dto.enums.ScoreAccess;
import com.ptit.music_be.dto.enums.ScoreSource;
import com.ptit.music_be.dto.enums.Visibility;
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
import com.ptit.music_be.event.ScoreTrashedByAdminEvent;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.mapper.AiTaskMapper;
import com.ptit.music_be.mapper.ScoreFileMapper;
import com.ptit.music_be.repository.AiTaskRepository;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.MemberScoreRepository;
import com.ptit.music_be.repository.ScoreFileRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.repository.ScoreReviewRepository;
import com.ptit.music_be.repository.ScoreTagRepository;
import com.ptit.music_be.repository.TagRepository;
import com.ptit.music_be.service.notification.NotificationService;
import com.ptit.music_be.service.permission.AccessDecision;
import com.ptit.music_be.service.permission.ScorePermissionService;
import com.ptit.music_be.service.score.ScoreFileService;
import com.ptit.music_be.service.score.ScoreService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class ScoreServiceImpl implements ScoreService {

    static final int DEFAULT_PAGE_SIZE = 10;
    static final int MAX_PAGE_SIZE = 50;
    static final int MAX_KEYWORD_LENGTH = 100;
    static final int MAX_TAGS_PER_SCORE = 10;
    static final int MAX_DELETE_REASON_LENGTH = 500;

    MemberRepository memberRepository;
    ScoreRepository scoreRepository;
    ScoreFileRepository scoreFileRepository;
    AiTaskRepository aiTaskRepository;
    TagRepository tagRepository;
    MemberScoreRepository memberScoreRepository;
    ScoreReviewRepository scoreReviewRepository;
    ScoreTagRepository scoreTagRepository;
    ScoreFileService scoreFileService;
    NotificationService notificationService;
    ScorePermissionService scorePermissionService;
    ApplicationEventPublisher eventPublisher;
    ScoreFileMapper scoreFileMapper;
    AiTaskMapper aiTaskMapper;

    // ------------------------------------------------------------------ danh sách

    @Override
    @Transactional(readOnly = true)
    public PageResponse<ScoreSummaryResponse> getMyScores(
            int page,
            int size,
            String keyword,
            String status,
            String source,
            String difficulty,
            String tagId,
            String sort) {
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
        Page<Score> result = scoreRepository.searchOfMember(
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
    public PageResponse<ScoreSummaryResponse> getSharedWithMe(int page, int size) {
        Member member = memberRepository
                .findByEmail(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
        int safeSize = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
        Page<Score> result =
                scoreRepository.findSharedWithMember(member.getId(), PageRequest.of(Math.max(page, 0), safeSize));

        Map<String, ScoreFile> thumbnails = loadThumbnails(result.getContent());
        Map<String, List<TagResponse>> tagsByScore = loadTags(result.getContent());
        Map<String, String> levels = new HashMap<>();
        for (var share : memberScoreRepository.findByMember(member)) {
            if (share.getPermission() != null) {
                levels.put(share.getScore().getId(), share.getPermission().name());
            }
        }
        List<ScoreSummaryResponse> content = result.getContent().stream()
                .map(score -> {
                    ScoreSummaryResponse summary = toSummary(
                            score, thumbnails.get(score.getId()), tagsByScore.getOrDefault(score.getId(), List.of()));
                    summary.setAccessLevel(levels.get(score.getId()));
                    summary.setOwnerEmail(
                            score.getMember() == null ? null : score.getMember().getEmail());
                    return summary;
                })
                .toList();
        return PageResponse.<ScoreSummaryResponse>builder()
                .content(content)
                .pageNumber(result.getNumber())
                .pageSize(result.getSize())
                .totalElements(result.getTotalElements())
                .totalPages(result.getTotalPages())
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public ScoreDetailResponse getScore(String scoreId) {
        Score score = findScore(scoreId);
        scoreFileService.checkCanView(score);
        scorePermissionService.auditModeratorAccess(score, "VIEW");
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
            changeVisibility(score, request.getVisibility());
        }
        if (request.getAllowDownload() != null) {
            // Chỉ chủ sở hữu quyết định người khác có được tải hay không
            scoreFileService.checkCanManageSharing(score);
            score.setAllowDownload(request.getAllowDownload());
        }

        return toDetail(scoreRepository.save(score));
    }

    /**
     * Đổi chế độ hiển thị. Chỉ chủ sở hữu hoặc ADMIN được đổi. Chủ xin PUBLIC thì thành PENDING chờ ADMIN duyệt; ADMIN
     * đặt PUBLIC thì có hiệu lực ngay; về PRIVATE thì có hiệu lực ngay (kể cả hủy yêu cầu đang chờ).
     */
    private void changeVisibility(Score score, Visibility requested) {
        scoreFileService.checkCanManageSharing(score);
        String current = score.getVisibility() == null ? Visibility.PRIVATE.name() : score.getVisibility();
        if (requested == Visibility.PRIVATE) {
            score.setVisibility(Visibility.PRIVATE.name());
            score.setRejectReason(null);
        } else if (SecurityUtils.isAdmin()) {
            score.setVisibility(Visibility.PUBLIC.name());
            score.setRejectReason(null);
        } else if (!Visibility.PUBLIC.name().equals(current)) {
            score.setVisibility(Visibility.PENDING.name());
            score.setRejectReason(null);
            if (!Visibility.PENDING.name().equals(current)) { // xin lại khi đang chờ thì không báo lần nữa
                Member me = memberRepository
                        .findByEmail(SecurityUtils.getCurrentEmail())
                        .orElse(null);
                notificationService.notifyAdmins(
                        me,
                        NotificationType.PUBLISH_REQUESTED,
                        score.getId(),
                        "Có bản nhạc xin công khai: \"" + score.getTitle() + "\"");
            }
        }
    }

    @Override
    @Transactional(readOnly = true)
    public PageResponse<ScoreSummaryResponse> getPendingPublic(int page, int size) {
        requireAdmin();
        int safeSize = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
        Page<Score> result = scoreRepository.findByVisibility(
                Visibility.PENDING.name(), PageRequest.of(Math.max(page, 0), safeSize, Sort.by("updatedAt")));
        Map<String, ScoreFile> thumbnails = loadThumbnails(result.getContent());
        Map<String, List<TagResponse>> tagsByScore = loadTags(result.getContent());
        List<ScoreSummaryResponse> content = result.getContent().stream()
                .map(score -> {
                    ScoreSummaryResponse summary = toSummary(
                            score, thumbnails.get(score.getId()), tagsByScore.getOrDefault(score.getId(), List.of()));
                    summary.setOwnerEmail(
                            score.getMember() == null ? null : score.getMember().getEmail());
                    return summary;
                })
                .toList();
        return PageResponse.<ScoreSummaryResponse>builder()
                .content(content)
                .pageNumber(result.getNumber())
                .pageSize(result.getSize())
                .totalElements(result.getTotalElements())
                .totalPages(result.getTotalPages())
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public PageResponse<ScoreSummaryResponse> getAllForAdmin(
            int page,
            int size,
            String keyword,
            String visibility,
            String official,
            String source,
            String difficulty,
            String sort) {
        requireAdmin();
        int safeSize = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
        String safeOfficial = official == null ? "" : official.trim().toLowerCase();
        if (!safeOfficial.isEmpty() && !"true".equals(safeOfficial) && !"false".equals(safeOfficial)) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
        Page<Score> result = scoreRepository.searchAllForAdmin(
                normalizeKeyword(keyword),
                parseEnumName(visibility, Visibility.class),
                safeOfficial,
                parseEnumName(source, ScoreSource.class),
                parseEnumName(difficulty, DifficultyLevel.class),
                PageRequest.of(Math.max(page, 0), safeSize, adminSort(sort)));
        return toSummaryPage(result, true);
    }

    /** Sắp xếp danh sách admin theo danh sách trắng, luôn kèm id để thứ tự ổn định giữa các trang. */
    private static Sort adminSort(String sort) {
        String key = sort == null ? "" : sort.trim().toUpperCase();
        Sort.Order primary =
                switch (key) {
                    case "", "UPDATED" -> Sort.Order.desc("updatedAt");
                    case "CREATED" -> Sort.Order.desc("createdAt");
                    case "TITLE" -> Sort.Order.asc("title");
                    case "VIEWS" -> Sort.Order.desc("viewCount");
                    default -> throw new AppException(ErrorCode.INVALID_REQUEST);
                };
        return Sort.by(primary, Sort.Order.asc("id"));
    }

    @Override
    @Transactional
    public ScoreDetailResponse setVisibilityByAdmin(String scoreId, Visibility visibility, String reason) {
        requireAdmin();
        if (visibility == null || visibility == Visibility.PENDING) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
        Score score = findScore(scoreId);
        String current = score.getVisibility() == null ? Visibility.PRIVATE.name() : score.getVisibility();
        if (current.equals(visibility.name())) {
            return toDetail(score);
        }
        // Admin chỉ kiểm duyệt: duyệt bản đang chờ (PENDING → PUBLIC) hoặc gỡ bản đã công khai (PUBLIC → PRIVATE).
        // Không tự công khai bản riêng tư của người khác khi chủ chưa xin.
        if (visibility == Visibility.PUBLIC && !Visibility.PENDING.name().equals(current)) {
            throw new AppException(ErrorCode.SCORE_NOT_PENDING_PUBLIC);
        }
        if (visibility == Visibility.PRIVATE && !Visibility.PUBLIC.name().equals(current)) {
            throw new AppException(ErrorCode.SCORE_NOT_PUBLIC);
        }
        if (visibility == Visibility.PUBLIC) {
            score.setVisibility(Visibility.PUBLIC.name());
            score.setRejectReason(null);
        } else {
            // Gỡ công khai: bản không còn public thì cũng rời kho score mẫu
            score.setVisibility(Visibility.PRIVATE.name());
            score.setRejectReason(blankToNull(reason));
            score.setIsOfficial(false);
        }
        Score saved = scoreRepository.save(score);
        boolean selfOwned = score.getMember() != null
                && score.getMember().getEmail() != null
                && score.getMember().getEmail().equalsIgnoreCase(SecurityUtils.getCurrentEmail());
        if (!selfOwned) {
            boolean makePublic = visibility == Visibility.PUBLIC;
            notificationService.notify(
                    score.getMember(),
                    null,
                    makePublic ? NotificationType.PUBLISH_APPROVED : NotificationType.PUBLISH_REJECTED,
                    score.getId(),
                    "Bản nhạc \"" + score.getTitle() + "\""
                            + (makePublic ? " đã được duyệt công khai" : " đã bị quản trị viên gỡ công khai")
                            + (!makePublic && saved.getRejectReason() != null ? ": " + saved.getRejectReason() : ""));
        }
        return toDetail(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public PageResponse<ScoreSummaryResponse> getOfficialScores(int page, int size, String keyword, String difficulty) {
        int safeSize = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
        Page<Score> result = scoreRepository.searchOfficial(
                normalizeKeyword(keyword),
                parseEnumName(difficulty, DifficultyLevel.class),
                PageRequest.of(Math.max(page, 0), safeSize));
        return toSummaryPage(result, false);
    }

    @Override
    @Transactional(readOnly = true)
    public PageResponse<ScoreSummaryResponse> getOfficialCandidates(int page, int size, String keyword) {
        requireAdmin();
        int safeSize = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
        Page<Score> result = scoreRepository.searchOfficialCandidates(
                normalizeKeyword(keyword), PageRequest.of(Math.max(page, 0), safeSize));
        return toSummaryPage(result, true);
    }

    @Override
    @Transactional
    public ScoreDetailResponse markOfficial(String scoreId) {
        requireAdmin();
        Score score = findScore(scoreId);
        // Không công khai bản riêng tư của người dùng chỉ vì đưa vào kho: phải đã được công khai trước
        if (!Visibility.PUBLIC.name().equals(score.getVisibility())) {
            throw new AppException(ErrorCode.SCORE_NOT_PUBLIC_FOR_OFFICIAL);
        }
        score.setIsOfficial(true);
        return toDetail(scoreRepository.save(score));
    }

    @Override
    @Transactional
    public ScoreDetailResponse unmarkOfficial(String scoreId) {
        requireAdmin();
        Score score = findScore(scoreId);
        score.setIsOfficial(false);
        return toDetail(scoreRepository.save(score));
    }

    private PageResponse<ScoreSummaryResponse> toSummaryPage(Page<Score> result, boolean withOwner) {
        Map<String, ScoreFile> thumbnails = loadThumbnails(result.getContent());
        Map<String, List<TagResponse>> tagsByScore = loadTags(result.getContent());
        List<ScoreSummaryResponse> content = result.getContent().stream()
                .map(score -> {
                    ScoreSummaryResponse summary = toSummary(
                            score, thumbnails.get(score.getId()), tagsByScore.getOrDefault(score.getId(), List.of()));
                    if (withOwner) {
                        summary.setOwnerEmail(
                                score.getMember() == null
                                        ? null
                                        : score.getMember().getEmail());
                    }
                    return summary;
                })
                .toList();
        return PageResponse.<ScoreSummaryResponse>builder()
                .content(content)
                .pageNumber(result.getNumber())
                .pageSize(result.getSize())
                .totalElements(result.getTotalElements())
                .totalPages(result.getTotalPages())
                .build();
    }

    @Override
    @Transactional
    public ScoreDetailResponse approvePublic(String scoreId) {
        requireAdmin();
        Score score = findPending(scoreId);
        score.setVisibility(Visibility.PUBLIC.name());
        score.setRejectReason(null);
        Score saved = scoreRepository.save(score);
        notificationService.notify(
                score.getMember(),
                null,
                NotificationType.PUBLISH_APPROVED,
                score.getId(),
                "Bản nhạc \"" + score.getTitle() + "\" đã được duyệt công khai");
        return toDetail(saved);
    }

    @Override
    @Transactional
    public ScoreDetailResponse rejectPublic(String scoreId, String reason) {
        requireAdmin();
        Score score = findPending(scoreId);
        score.setVisibility(Visibility.PRIVATE.name());
        score.setRejectReason(blankToNull(reason));
        Score saved = scoreRepository.save(score);
        notificationService.notify(
                score.getMember(),
                null,
                NotificationType.PUBLISH_REJECTED,
                score.getId(),
                "Bản nhạc \"" + score.getTitle() + "\" bị từ chối công khai"
                        + (score.getRejectReason() == null ? "" : ": " + score.getRejectReason()));
        return toDetail(saved);
    }

    private static void requireAdmin() {
        if (!SecurityUtils.isAdmin()) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
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

        // Chỉ xóa tag không còn được chọn và thêm tag mới, tag giữ nguyên thì không đụng tới (orphanRemoval lo việc
        // xóa)
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
        deleteScore(scoreId, null);
    }

    /**
     * Chuyển bản nhạc vào thùng rác (xóa mềm): file trên đĩa và các dòng liên quan được giữ nguyên tới khi bị xóa hẳn
     * (xem {@code ScoreTrashService}). Chủ sở hữu xóa bản của mình; ADMIN chỉ xóa để kiểm duyệt bản đang PUBLIC /
     * PENDING và khi đó bản nhạc về PRIVATE để chủ khôi phục xong không tự công khai lại.
     */
    @Override
    @Transactional
    public void deleteScore(String scoreId, String reason) {
        Score score = findScore(scoreId);
        AccessDecision decision = scorePermissionService.resolve(score);
        if (!scorePermissionService.canDelete(score, decision)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
        // Bản trong kho score mẫu chỉ ADMIN được xóa (chủ sở hữu muốn xóa thì nhờ admin gỡ khỏi kho trước)
        if (Boolean.TRUE.equals(score.getIsOfficial()) && !SecurityUtils.isAdmin()) {
            throw new AppException(ErrorCode.SCORE_OFFICIAL_LOCKED);
        }
        // Đang có tác vụ chạy thì không cho xóa (worker/AI service còn đang ghi file vào thư mục của score)
        if (aiTaskRepository.existsByScoreIdAndStatusIn(
                scoreId, List.of(AiTaskStatus.PENDING, AiTaskStatus.PROCESSING))) {
            throw new AppException(ErrorCode.SCORE_BUSY);
        }

        Member actor = memberRepository
                .findByEmail(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
        boolean byOwner = decision.level() == ScoreAccess.OWNER;
        String cleanReason = truncate(blankToNull(reason), MAX_DELETE_REASON_LENGTH);

        if (!byOwner) {
            scorePermissionService.auditModeratorAccess(score, "DELETE");
        }
        score.setDeletedAt(LocalDateTime.now());
        score.setDeletedBy(actor.getId());
        score.setDeleteReason(cleanReason);
        // Yêu cầu công khai đang chờ bị hủy; bản bị ADMIN gỡ thì không còn công khai và rời kho score mẫu
        if (!byOwner || Visibility.PENDING.name().equals(score.getVisibility())) {
            score.setVisibility(Visibility.PRIVATE.name());
        }
        if (!byOwner) {
            score.setIsOfficial(false);
        }
        scoreRepository.save(score);

        if (!byOwner && score.getMember() != null) {
            eventPublisher.publishEvent(new ScoreTrashedByAdminEvent(
                    score.getId(), score.getMember().getId(), score.getTitle(), cleanReason));
        }
    }

    // ------------------------------------------------------------------ helpers

    /** Bản nhạc phải đang chờ duyệt (PENDING): tránh duyệt nhầm bản riêng tư hoặc thu hồi bản đã công khai. */
    private Score findPending(String scoreId) {
        Score score = findScore(scoreId);
        if (!Visibility.PENDING.name().equals(score.getVisibility())) {
            throw new AppException(ErrorCode.SCORE_NOT_PENDING_PUBLIC);
        }
        return score;
    }

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
                .isOfficial(score.getIsOfficial())
                .measureCount(score.getMeasureCount())
                .tags(tags)
                .thumbnailUrl(thumbnail == null ? null : "/api/files/" + thumbnail.getId() + "/download?inline=true")
                .createdAt(score.getCreatedAt())
                .updatedAt(score.getUpdatedAt())
                .build();
    }

    private ScoreDetailResponse toDetail(Score score) {
        AccessDecision decision = scorePermissionService.resolve(score);
        boolean canEdit = scorePermissionService.canEdit(score, decision);
        boolean isOwner = decision.level() == ScoreAccess.OWNER;
        // Chỉ hiện các file hiện hành (is_current null coi như hiện hành, vì dữ liệu cũ chưa có cột này).
        // Người xem dưới quyền sửa không thấy file gốc (PDF/ảnh/MusicXML/MIDI gốc, kern, ảnh trang)
        List<ScoreFile> currentFiles =
                scoreFileRepository.findByScoreIdOrderByFileTypeAscPageNumberAsc(score.getId()).stream()
                        .filter(f -> f.getIsCurrent() == null || f.getIsCurrent())
                        .filter(f -> canEdit || !ScoreFileServiceImpl.SOURCE_FILE_TYPES.contains(f.getFileType()))
                        .toList();

        // Task mới nhất của mỗi loại: danh sách đã sắp xếp mới -> cũ nên lấy phần tử đầu tiên của từng loại.
        // Lịch sử tác vụ chỉ dành cho người có quyền sửa
        List<AiTaskResponse> latestTasks = List.of();
        if (canEdit) {
            Map<Object, AiTask> latestByType = new LinkedHashMap<>();
            for (AiTask task : aiTaskRepository.findByScoreIdOrderByCreatedAtDesc(score.getId())) {
                latestByType.putIfAbsent(task.getTaskType(), task);
            }
            latestTasks =
                    latestByType.values().stream().map(aiTaskMapper::toResponse).toList();
        }

        var rating = scoreReviewRepository.getRatingStats(score.getId());

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
                .averageRating(rating.getAverage() == null ? null : Math.round(rating.getAverage() * 10) / 10.0)
                .ratingCount(rating.getRatingCount() == null ? 0 : rating.getRatingCount())
                .ownerEmail(score.getMember() == null ? null : score.getMember().getEmail())
                .canEdit(canEdit)
                .canDelete(scorePermissionService.canDelete(score, decision))
                .canReview(decision.can(ScoreAccess.REVIEW))
                .canManageSharing(isOwner)
                .accessLevel(
                        decision.level() == ScoreAccess.NONE
                                ? null
                                : decision.level().name())
                .canDownload(canEdit || (decision.can(ScoreAccess.VIEW) && score.isAllowDownload()))
                .allowDownload(isOwner && score.isAllowDownload())
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
        trimmed = trimmed.length() > MAX_KEYWORD_LENGTH ? trimmed.substring(0, MAX_KEYWORD_LENGTH) : trimmed;
        // Escape ký tự đại diện của LIKE để "%" và "_" được tìm như ký tự thường (khớp với escape '\\' ở repository)
        return trimmed.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
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

    private static String truncate(String value, int max) {
        return value == null || value.length() <= max ? value : value.substring(0, max);
    }

    private static String blankToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }
}
