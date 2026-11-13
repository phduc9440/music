package com.ptit.music_be.service.score.impl;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;
import org.w3c.dom.Document;
import org.w3c.dom.Element;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ptit.music_be.dto.enums.ai.AiTaskStatus;
import com.ptit.music_be.dto.enums.ai.AiTaskType;
import com.ptit.music_be.dto.enums.notification.NotificationType;
import com.ptit.music_be.dto.enums.score.ScoreAccess;
import com.ptit.music_be.dto.enums.score.SharePermission;
import com.ptit.music_be.dto.enums.score.SuggestionChangeStatus;
import com.ptit.music_be.dto.enums.score.SuggestionFilter;
import com.ptit.music_be.dto.enums.score.SuggestionSource;
import com.ptit.music_be.dto.enums.score.SuggestionStatus;
import com.ptit.music_be.dto.request.score.SuggestionDecisionRequest;
import com.ptit.music_be.dto.response.common.PageResponse;
import com.ptit.music_be.dto.response.score.CommentMemberResponse;
import com.ptit.music_be.dto.response.score.ScoreContent;
import com.ptit.music_be.dto.response.score.ScoreSaveResponse;
import com.ptit.music_be.dto.response.score.ScoreVersionConflict;
import com.ptit.music_be.dto.response.score.SuggestionChangeResponse;
import com.ptit.music_be.dto.response.score.SuggestionDetailResponse;
import com.ptit.music_be.dto.response.score.SuggestionSummaryResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.MemberScore;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreSuggestion;
import com.ptit.music_be.entity.ScoreSuggestionChange;
import com.ptit.music_be.event.RewardEarnedEvent;
import com.ptit.music_be.event.RewardReason;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.ai.AiTaskRepository;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.score.MemberScoreRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.repository.score.ScoreSuggestionChangeRepository;
import com.ptit.music_be.repository.score.ScoreSuggestionRepository;
import com.ptit.music_be.service.notification.NotificationService;
import com.ptit.music_be.service.permission.AccessDecision;
import com.ptit.music_be.service.permission.ScorePermissionService;
import com.ptit.music_be.service.score.ScoreContentService;
import com.ptit.music_be.service.score.ScoreEditService;
import com.ptit.music_be.service.score.SuggestionService;
import com.ptit.music_be.service.storage.FileStorageService;
import com.ptit.music_be.utils.MeasureHasher;
import com.ptit.music_be.utils.MusicXmlInspector;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class SuggestionServiceImpl implements SuggestionService {

    static final int MAX_TITLE = 200;
    static final int MAX_DESCRIPTION = 2000;
    static final int MAX_NOTE = 500;
    static final int MAX_OPEN_PER_AUTHOR = 10;
    static final int MAX_PER_DAY = 30;
    static final int MAX_PAGE_SIZE = 50;
    /** Số ngày giữ file của đề xuất đã đóng. */
    static final int CLOSED_FILE_RETENTION_DAYS = 30;

    static final String STALE_VERSION = "VERSION_CHANGED";
    static final String STALE_STRUCTURE = "STRUCTURE_CHANGED";
    static final String STALE_CONTEXT = "CONTEXT_CHANGED";

    private static final List<AiTaskStatus> ACTIVE_TASK_STATUSES =
            List.of(AiTaskStatus.PENDING, AiTaskStatus.PROCESSING);

    private final ScoreRepository scoreRepository;
    private final ScoreSuggestionRepository suggestionRepository;
    private final ScoreSuggestionChangeRepository changeRepository;
    private final MemberRepository memberRepository;
    private final MemberScoreRepository memberScoreRepository;
    private final AiTaskRepository aiTaskRepository;
    private final ScorePermissionService permissionService;
    private final ScoreEditService scoreEditService;
    private final ScoreContentService scoreContentService;
    private final FileStorageService fileStorageService;
    private final NotificationService notificationService;
    private final ApplicationEventPublisher eventPublisher;
    private final ObjectMapper objectMapper;
    private final long maxMusicXmlBytes;

    public SuggestionServiceImpl(
            ScoreRepository scoreRepository,
            ScoreSuggestionRepository suggestionRepository,
            ScoreSuggestionChangeRepository changeRepository,
            MemberRepository memberRepository,
            MemberScoreRepository memberScoreRepository,
            AiTaskRepository aiTaskRepository,
            ScorePermissionService permissionService,
            ScoreEditService scoreEditService,
            ScoreContentService scoreContentService,
            FileStorageService fileStorageService,
            NotificationService notificationService,
            ApplicationEventPublisher eventPublisher,
            ObjectMapper objectMapper,
            @Value("${app.editor.max-musicxml-bytes:5242880}") long maxMusicXmlBytes) {
        this.scoreRepository = scoreRepository;
        this.suggestionRepository = suggestionRepository;
        this.changeRepository = changeRepository;
        this.memberRepository = memberRepository;
        this.memberScoreRepository = memberScoreRepository;
        this.aiTaskRepository = aiTaskRepository;
        this.permissionService = permissionService;
        this.scoreEditService = scoreEditService;
        this.scoreContentService = scoreContentService;
        this.fileStorageService = fileStorageService;
        this.notificationService = notificationService;
        this.eventPublisher = eventPublisher;
        this.objectMapper = objectMapper;
        this.maxMusicXmlBytes = maxMusicXmlBytes;
    }

    /** Kết quả so đề xuất với bản hiện hành; {@code staleReason} null là còn áp dụng được. */
    private record Currentness(String staleReason, Set<String> conflictIds, Map<String, String> partNames) {
        static final Currentness CLOSED = new Currentness(null, Set.of(), Map.of());
    }

    // ------------------------------------------------------------------------------------------------ gửi

    @Override
    @Transactional
    public SuggestionDetailResponse create(
            String scoreId, MultipartFile file, Integer baseVersion, String title, String description) {
        Score score = findScore(scoreId);
        AccessDecision decision = permissionService.resolve(score);
        if (!decision.can(ScoreAccess.REVIEW)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
        if (aiTaskRepository.existsByScoreIdAndTaskTypeAndStatusIn(
                score.getId(), AiTaskType.OMR_CONVERSION, ACTIVE_TASK_STATUSES)) {
            throw new AppException(ErrorCode.SCORE_BUSY);
        }
        String cleanTitle = title == null ? "" : title.strip();
        if (cleanTitle.isEmpty() || cleanTitle.length() > MAX_TITLE) {
            throw new AppException(ErrorCode.SUGGESTION_FIELDS_INVALID);
        }
        String cleanDescription = cleanOptional(description, MAX_DESCRIPTION);

        byte[] bytes = readUpload(file);
        MusicXmlInspector.inspect(bytes);
        Document proposed = MusicXmlInspector.parseSecure(bytes);

        Integer currentVersion = score.getCurrentVersion();
        if (baseVersion == null || baseVersion < 1 || currentVersion == null || baseVersion > currentVersion) {
            throw new AppException(ErrorCode.SCORE_VERSION_NOT_EXISTED);
        }

        // Khóa dòng người gửi để hai lần gửi cùng lúc không cùng vượt giới hạn
        Member me = memberRepository
                .findByEmailForUpdate(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
        if (suggestionRepository.countOpenOf(score.getId(), me.getId()) >= MAX_OPEN_PER_AUTHOR) {
            throw new AppException(ErrorCode.SUGGESTION_TOO_MANY_OPEN);
        }
        if (suggestionRepository.countCreatedSince(
                        me.getId(), LocalDateTime.now().minusHours(24))
                >= MAX_PER_DAY) {
            throw new AppException(ErrorCode.SUGGESTION_RATE_LIMITED);
        }

        ScoreContent base = scoreEditService.getVersionContent(score.getId(), baseVersion);
        SuggestionDiffer.Result result = SuggestionDiffer.diff(MusicXmlInspector.parseStored(base.bytes()), proposed);
        if (!result.structural() && result.changes().isEmpty()) {
            throw new AppException(ErrorCode.SUGGESTION_EMPTY);
        }

        ScoreSuggestion suggestion = suggestionRepository.save(ScoreSuggestion.builder()
                .score(score)
                .author(me)
                .source(SuggestionSource.EDITOR)
                .baseVersion(baseVersion)
                .baseShape(shapeToJson(result.baseShape()))
                .title(cleanTitle)
                .description(cleanDescription)
                .status(SuggestionStatus.OPEN)
                .structural(result.structural())
                .build());
        String storagePath = "scores/%s/suggestions/%s.musicxml".formatted(score.getId(), suggestion.getId());
        deleteOnRollback(storagePath);
        fileStorageService.store(new ByteArrayInputStream(bytes), storagePath);
        suggestion.setStoragePath(storagePath);

        List<ScoreSuggestionChange> changes = changeRepository.saveAll(result.changes().stream()
                .map(change -> ScoreSuggestionChange.builder()
                        .suggestion(suggestion)
                        .partIndex(change.partIndex())
                        .measureIndex(change.measureIndex())
                        .measureNumber(change.measureNumber())
                        .baseHash(change.baseHash())
                        .contextHash(change.contextHash())
                        .proposedXml(change.proposedXml())
                        .status(SuggestionChangeStatus.PENDING)
                        .build())
                .toList());
        notifyNew(score, suggestion, me, changes.size());
        return detail(suggestion, score, decision, me, changes);
    }

    // ------------------------------------------------------------------------------------------------ đọc

    @Override
    @Transactional(readOnly = true)
    public PageResponse<SuggestionSummaryResponse> list(String scoreId, SuggestionFilter filter, int page, int size) {
        Score score = findScore(scoreId);
        AccessDecision decision = permissionService.resolve(score);
        if (!decision.can(ScoreAccess.REVIEW)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
        Member me = currentMember();
        String authorFilter = permissionService.canEdit(score, decision) ? null : me.getId();
        SuggestionFilter effective = filter == null ? SuggestionFilter.ALL : filter;
        Page<ScoreSuggestion> found = suggestionRepository.findPage(
                score.getId(),
                effective.statuses(),
                authorFilter,
                PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), MAX_PAGE_SIZE)));

        List<ScoreSuggestion> rows = found.getContent();
        Map<String, Integer> counts = new HashMap<>();
        Set<String> staleIds = Set.of();
        if (!rows.isEmpty()) {
            List<String> ids = rows.stream().map(ScoreSuggestion::getId).toList();
            for (Object[] row : changeRepository.countBySuggestionIds(ids)) {
                counts.put((String) row[0], ((Number) row[1]).intValue());
            }
            staleIds = staleOpenIds(score, rows);
        }
        Set<String> stale = staleIds;
        List<SuggestionSummaryResponse> content = rows.stream()
                .map(s -> summary(s, counts.getOrDefault(s.getId(), 0), stale.contains(s.getId())))
                .toList();
        return PageResponse.<SuggestionSummaryResponse>builder()
                .content(content)
                .pageNumber(found.getNumber())
                .pageSize(found.getSize())
                .totalElements(found.getTotalElements())
                .totalPages(found.getTotalPages())
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public SuggestionDetailResponse get(String suggestionId) {
        ScoreSuggestion suggestion = findSuggestion(suggestionId);
        Score score = findScore(suggestion.getScore().getId());
        AccessDecision decision = permissionService.resolve(score);
        Member me = currentMember();
        requireVisible(suggestion, score, decision, me);
        return detail(suggestion, score, decision, me, changeRepository.findBySuggestion(suggestion.getId()));
    }

    @Override
    @Transactional(readOnly = true)
    public byte[] content(String suggestionId) {
        ScoreSuggestion suggestion = findSuggestion(suggestionId);
        Score score = findScore(suggestion.getScore().getId());
        requireVisible(suggestion, score, permissionService.resolve(score), currentMember());
        return readProposalFile(suggestion);
    }

    // ------------------------------------------------------------------------------------------------ quyết định

    @Override
    @Transactional
    public SuggestionDetailResponse accept(String suggestionId, String ifMatch, SuggestionDecisionRequest request) {
        // Luôn khóa dòng đề xuất trước, rồi mới tới dòng scores (trong saveWithMeta) để không khóa chéo
        ScoreSuggestion suggestion = lock(suggestionId);
        Score score = findScore(suggestion.getScore().getId());
        AccessDecision decision = permissionService.resolve(score);
        requireCanDecide(suggestion, score, decision);
        String note = cleanOptional(request == null ? null : request.getNote(), MAX_NOTE);
        List<ScoreSuggestionChange> changes = changeRepository.findBySuggestion(suggestion.getId());
        Set<String> chosen = chosenIds(suggestion, changes, request);

        ScoreContent current = scoreContentService.getMusicXml(score.getId());
        Integer expected = ScoreEditServiceImpl.parseIfMatch(ifMatch);
        if (expected == null || expected != current.version()) {
            throw new AppException(ErrorCode.SCORE_VERSION_CONFLICT, new ScoreVersionConflict(current.version()));
        }
        Document currentDoc = MusicXmlInspector.parseStored(current.bytes());
        if (analyse(suggestion, changes, current, currentDoc).staleReason() != null) {
            throw new AppException(ErrorCode.SUGGESTION_OUTDATED);
        }

        byte[] merged = suggestion.isStructural() ? readProposalFile(suggestion) : merge(currentDoc, changes, chosen);
        Member me = currentMember();
        ScoreSaveResponse saved =
                scoreEditService.saveWithMeta(score.getId(), merged, ifMatch, versionMeta(suggestion));

        int accepted = 0;
        for (ScoreSuggestionChange change : changes) {
            boolean taken = chosen.contains(change.getId());
            change.setStatus(taken ? SuggestionChangeStatus.ACCEPTED : SuggestionChangeStatus.REJECTED);
            accepted += taken ? 1 : 0;
        }
        changeRepository.saveAll(changes);
        close(suggestion, accepted == changes.size() ? SuggestionStatus.ACCEPTED : SuggestionStatus.PARTIAL, me, note);
        suggestion.setAppliedVersion(saved.getVersion());
        notifyDecided(score, suggestion, me, accepted, changes.size());
        rewardAuthor(score, suggestion, me);
        return detail(suggestion, score, decision, me, changes);
    }

    @Override
    @Transactional
    public SuggestionDetailResponse reject(String suggestionId, SuggestionDecisionRequest request) {
        ScoreSuggestion suggestion = lock(suggestionId);
        Score score = findScore(suggestion.getScore().getId());
        AccessDecision decision = permissionService.resolve(score);
        requireCanDecide(suggestion, score, decision);
        String note = cleanOptional(request == null ? null : request.getNote(), MAX_NOTE);
        List<ScoreSuggestionChange> changes = changeRepository.findBySuggestion(suggestion.getId());

        ScoreContent current = scoreContentService.getMusicXml(score.getId());
        boolean stale = analyse(suggestion, changes, current, MusicXmlInspector.parseStored(current.bytes()))
                        .staleReason()
                != null;
        changes.forEach(change -> change.setStatus(SuggestionChangeStatus.REJECTED));
        changeRepository.saveAll(changes);
        Member me = currentMember();
        close(suggestion, stale ? SuggestionStatus.OUTDATED : SuggestionStatus.REJECTED, me, note);
        notifyDecided(score, suggestion, me, 0, changes.size());
        return detail(suggestion, score, decision, me, changes);
    }

    @Override
    @Transactional
    public void withdraw(String suggestionId) {
        ScoreSuggestion suggestion = lock(suggestionId);
        Score score = findScore(suggestion.getScore().getId());
        Member me = currentMember();
        requireVisible(suggestion, score, permissionService.resolve(score), me);
        if (!isAuthor(suggestion, me)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
        if (suggestion.getStatus() != SuggestionStatus.OPEN) {
            throw new AppException(ErrorCode.SUGGESTION_NOT_OPEN);
        }
        suggestion.setStatus(SuggestionStatus.WITHDRAWN);
        suggestion.setDecidedAt(LocalDateTime.now());
    }

    @Override
    @Transactional
    public int cleanupClosedFiles() {
        List<ScoreSuggestion> expired = suggestionRepository.findClosedWithFileBefore(
                SuggestionStatus.CLOSED, LocalDateTime.now().minusDays(CLOSED_FILE_RETENTION_DAYS));
        List<String> paths =
                expired.stream().map(ScoreSuggestion::getStoragePath).toList();
        expired.forEach(s -> s.setStoragePath(null));
        deleteAfterCommit(paths);
        return expired.size();
    }

    // ------------------------------------------------------------------------------------------------ nhận đề xuất

    /** Id các ô được nhận: tất cả khi {@code changeIds} null; đề xuất đổi cấu trúc chỉ nhận tất cả (trả tập rỗng). */
    private Set<String> chosenIds(
            ScoreSuggestion suggestion, List<ScoreSuggestionChange> changes, SuggestionDecisionRequest request) {
        List<String> requested = request == null ? null : request.getChangeIds();
        if (suggestion.isStructural()) {
            if (requested != null) {
                throw new AppException(ErrorCode.SUGGESTION_CHANGES_INVALID);
            }
            return Set.of();
        }
        Set<String> known = changes.stream().map(ScoreSuggestionChange::getId).collect(Collectors.toSet());
        if (requested == null) {
            return known;
        }
        Set<String> chosen = new LinkedHashSet<>(requested);
        if (chosen.isEmpty() || !known.containsAll(chosen)) {
            throw new AppException(ErrorCode.SUGGESTION_CHANGES_INVALID);
        }
        return chosen;
    }

    /** Thay các ô được chọn trong bản hiện hành bằng ô đề xuất, rồi serialize (không DOCTYPE, như Editor xuất). */
    private byte[] merge(Document currentDoc, List<ScoreSuggestionChange> changes, Set<String> chosen) {
        List<List<Element>> measures = SuggestionDiffer.measuresOf(currentDoc);
        for (ScoreSuggestionChange change : changes) {
            if (!chosen.contains(change.getId())) {
                continue;
            }
            Element old = measures.get(change.getPartIndex()).get(change.getMeasureIndex());
            Element proposed = MusicXmlInspector.parseStored(
                            change.getProposedXml().getBytes(StandardCharsets.UTF_8))
                    .getDocumentElement();
            old.getParentNode().replaceChild(currentDoc.importNode(proposed, true), old);
        }
        if (currentDoc.getDoctype() != null) {
            currentDoc.removeChild(currentDoc.getDoctype());
        }
        return SuggestionDiffer.serialize(currentDoc, false).getBytes(StandardCharsets.UTF_8);
    }

    /** Khóa ghi vào meta của version mới: đủ để lịch sử hiện "Nhận đề xuất của A". */
    private Map<String, Object> versionMeta(ScoreSuggestion suggestion) {
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("suggestionId", suggestion.getId());
        if (suggestion.getAuthor() != null) {
            meta.put("suggestionAuthorId", suggestion.getAuthor().getId());
            meta.put("suggestionAuthorName", ScoreCommentServiceImpl.displayName(suggestion.getAuthor()));
        }
        return meta;
    }

    private void close(ScoreSuggestion suggestion, SuggestionStatus status, Member decider, String note) {
        suggestion.setStatus(status);
        suggestion.setDecidedBy(decider);
        suggestion.setDecidedAt(LocalDateTime.now());
        suggestion.setDecisionNote(note);
    }

    // ------------------------------------------------------------------------------------------------ lỗi thời, xung
    // đột

    /** Đề xuất còn mở trong trang hiện tại mà bản chính đã đổi đến mức không áp dụng được. */
    private Set<String> staleOpenIds(Score score, List<ScoreSuggestion> rows) {
        List<ScoreSuggestion> open = rows.stream()
                .filter(s -> s.getStatus() == SuggestionStatus.OPEN)
                .toList();
        if (open.isEmpty()) {
            return Set.of();
        }
        ScoreContent current = scoreContentService.getMusicXml(score.getId());
        Document currentDoc = MusicXmlInspector.parseStored(current.bytes());
        Map<String, List<ScoreSuggestionChange>> changesById =
                changeRepository
                        .findBySuggestionIdIn(
                                open.stream().map(ScoreSuggestion::getId).toList())
                        .stream()
                        .collect(Collectors.groupingBy(c -> c.getSuggestion().getId()));
        return open.stream()
                .filter(s -> analyse(s, changesById.getOrDefault(s.getId(), List.of()), current, currentDoc)
                                .staleReason()
                        != null)
                .map(ScoreSuggestion::getId)
                .collect(Collectors.toSet());
    }

    /**
     * So đề xuất với bản hiện hành: lỗi thời khi khung đã đổi hoặc ngữ cảnh một ô được đổi đã khác (đề xuất đổi cấu trúc
     * thì khi version hiện hành khác version gốc); xung đột ở ô mà bản chính đã sửa sau khi đề xuất.
     */
    private Currentness analyse(
            ScoreSuggestion suggestion,
            List<ScoreSuggestionChange> changes,
            ScoreContent current,
            Document currentDoc) {
        Map<String, String> names = SuggestionDiffer.partNames(currentDoc);
        if (suggestion.isStructural()) {
            String reason = suggestion.getBaseVersion() != current.version() ? STALE_VERSION : null;
            return new Currentness(reason, Set.of(), names);
        }
        if (!SuggestionDiffer.shapeOf(currentDoc).equals(shapeFromJson(suggestion.getBaseShape()))) {
            return new Currentness(STALE_STRUCTURE, Set.of(), names);
        }
        List<List<Element>> measures = SuggestionDiffer.measuresOf(currentDoc);
        List<List<String>> contexts = SuggestionDiffer.contextHashes(measures);
        String reason = null;
        Set<String> conflicts = new HashSet<>();
        for (ScoreSuggestionChange change : changes) {
            int part = change.getPartIndex();
            int index = change.getMeasureIndex();
            if (!contexts.get(part).get(index).equals(change.getContextHash())) {
                reason = STALE_CONTEXT;
            }
            if (!MeasureHasher.hash(measures.get(part).get(index)).equals(change.getBaseHash())) {
                conflicts.add(change.getId());
            }
        }
        return new Currentness(reason, conflicts, names);
    }

    private String shapeToJson(SuggestionDiffer.Shape shape) {
        ObjectNode node = objectMapper.createObjectNode();
        ArrayNode parts = node.putArray("parts");
        shape.parts().forEach(id -> parts.add(id));
        ArrayNode counts = node.putArray("measures");
        shape.measures().forEach(count -> counts.add(count));
        return node.toString();
    }

    private SuggestionDiffer.Shape shapeFromJson(String json) {
        try {
            JsonNode node = objectMapper.readTree(json);
            List<String> parts = new ArrayList<>();
            node.get("parts").forEach(id -> parts.add(id.asText()));
            List<Integer> counts = new ArrayList<>();
            node.get("measures").forEach(count -> counts.add(count.asInt()));
            return new SuggestionDiffer.Shape(parts, counts);
        } catch (JsonProcessingException | NullPointerException e) {
            throw new IllegalStateException("base_shape của đề xuất không đọc được: " + json, e);
        }
    }

    // ------------------------------------------------------------------------------------------------ quyền

    /** Người xem được đề xuất: từ REVIEW trở lên, và là tác giả hoặc có quyền sửa (người khác: coi như không tồn tại). */
    private void requireVisible(ScoreSuggestion suggestion, Score score, AccessDecision decision, Member me) {
        if (!decision.can(ScoreAccess.REVIEW)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
        if (!isAuthor(suggestion, me) && !permissionService.canEdit(score, decision)) {
            throw new AppException(ErrorCode.SUGGESTION_NOT_EXISTED);
        }
    }

    private void requireCanDecide(ScoreSuggestion suggestion, Score score, AccessDecision decision) {
        if (!permissionService.canEdit(score, decision)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
        if (suggestion.getStatus() != SuggestionStatus.OPEN) {
            throw new AppException(ErrorCode.SUGGESTION_NOT_OPEN);
        }
    }

    private static boolean isAuthor(ScoreSuggestion suggestion, Member me) {
        return suggestion.getAuthor() != null && suggestion.getAuthor().getId().equals(me.getId());
    }

    // ------------------------------------------------------------------------------------------------ thông báo, điểm

    /** Báo chủ bản nhạc và người được chia sẻ quyền sửa (trừ người gửi). */
    private void notifyNew(Score score, ScoreSuggestion suggestion, Member actor, int count) {
        Map<String, Member> recipients = new LinkedHashMap<>();
        if (score.getMember() != null) {
            recipients.put(score.getMember().getId(), score.getMember());
        }
        for (MemberScore share : memberScoreRepository.findByScoreIdFetchMember(score.getId())) {
            if (share.getPermission() == SharePermission.EDIT) {
                recipients.putIfAbsent(share.getMember().getId(), share.getMember());
            }
        }
        String name = ScoreCommentServiceImpl.displayName(actor);
        for (Member recipient : recipients.values()) {
            notificationService.notify(
                    recipient,
                    actor,
                    NotificationType.SUGGESTION_NEW,
                    score.getId(),
                    name + " đã đề xuất sửa “" + suggestion.getTitle() + "” trong bản nhạc “" + score.getTitle() + "”",
                    NotificationService.params(
                            "name",
                            name,
                            "title",
                            score.getTitle(),
                            "suggestionId",
                            suggestion.getId(),
                            "count",
                            String.valueOf(count)));
        }
    }

    private void notifyDecided(Score score, ScoreSuggestion suggestion, Member actor, int accepted, int total) {
        String name = ScoreCommentServiceImpl.displayName(actor);
        notificationService.notify(
                suggestion.getAuthor(),
                actor,
                NotificationType.SUGGESTION_DECIDED,
                score.getId(),
                name + " đã xử lý đề xuất “" + suggestion.getTitle() + "” của bạn trong “" + score.getTitle() + "”",
                NotificationService.params(
                        "name",
                        name,
                        "title",
                        score.getTitle(),
                        "suggestionId",
                        suggestion.getId(),
                        "status",
                        suggestion.getStatus().name(),
                        "accepted",
                        String.valueOf(accepted),
                        "total",
                        String.valueOf(total)));
    }

    /** Thưởng người đề xuất khi được nhận, trừ khi họ là chủ bản nhạc hoặc chính người nhận. */
    private void rewardAuthor(Score score, ScoreSuggestion suggestion, Member decider) {
        Member author = suggestion.getAuthor();
        if (author == null
                || (score.getMember() != null
                        && author.getId().equals(score.getMember().getId()))
                || author.getId().equals(decider.getId())) {
            return;
        }
        eventPublisher.publishEvent(
                new RewardEarnedEvent(author.getId(), RewardReason.SUGGESTION_ACCEPTED, suggestion.getId()));
    }

    // ------------------------------------------------------------------------------------------------ dựng phản hồi

    private SuggestionDetailResponse detail(
            ScoreSuggestion suggestion,
            Score score,
            AccessDecision decision,
            Member me,
            List<ScoreSuggestionChange> changes) {
        Currentness currentness = Currentness.CLOSED;
        if (suggestion.getStatus() == SuggestionStatus.OPEN) {
            ScoreContent current = scoreContentService.getMusicXml(score.getId());
            currentness = analyse(suggestion, changes, current, MusicXmlInspector.parseStored(current.bytes()));
        }
        SuggestionDiffer.Shape shape = shapeFromJson(suggestion.getBaseShape());
        Currentness view = currentness;
        List<SuggestionChangeResponse> changeViews = changes.stream()
                .map(change -> SuggestionChangeResponse.builder()
                        .id(change.getId())
                        .partIndex(change.getPartIndex())
                        .partName(partName(shape, change.getPartIndex(), view))
                        .measureIndex(change.getMeasureIndex())
                        .measureNumber(change.getMeasureNumber())
                        .status(change.getStatus())
                        .conflict(view.conflictIds().contains(change.getId()))
                        .build())
                .toList();
        boolean open = suggestion.getStatus() == SuggestionStatus.OPEN;
        return SuggestionDetailResponse.builder()
                .id(suggestion.getId())
                .title(suggestion.getTitle())
                .status(suggestion.getStatus())
                .structural(suggestion.isStructural())
                .stale(view.staleReason() != null)
                .changeCount(changes.size())
                .author(member(suggestion.getAuthor()))
                .createdAt(suggestion.getCreatedAt())
                .decidedAt(suggestion.getDecidedAt())
                .scoreId(score.getId())
                .scoreTitle(score.getTitle())
                .description(suggestion.getDescription())
                .source(suggestion.getSource())
                .baseVersion(suggestion.getBaseVersion())
                .currentVersion(score.getCurrentVersion() == null ? 0 : score.getCurrentVersion())
                .staleReason(view.staleReason())
                .changes(changeViews)
                .decidedBy(member(suggestion.getDecidedBy()))
                .decisionNote(suggestion.getDecisionNote())
                .appliedVersion(suggestion.getAppliedVersion())
                .canDecide(open && permissionService.canEdit(score, decision))
                .canWithdraw(open && isAuthor(suggestion, me))
                .build();
    }

    private SuggestionSummaryResponse summary(ScoreSuggestion suggestion, int changeCount, boolean stale) {
        return SuggestionSummaryResponse.builder()
                .id(suggestion.getId())
                .title(suggestion.getTitle())
                .status(suggestion.getStatus())
                .structural(suggestion.isStructural())
                .stale(stale)
                .changeCount(changeCount)
                .author(member(suggestion.getAuthor()))
                .createdAt(suggestion.getCreatedAt())
                .decidedAt(suggestion.getDecidedAt())
                .build();
    }

    /** Tên part nếu bản hiện hành còn ghi; không thì id part; ngoài khung thì "P{n}". */
    private static String partName(SuggestionDiffer.Shape shape, int partIndex, Currentness view) {
        if (partIndex >= shape.parts().size()) {
            return "P" + (partIndex + 1);
        }
        String id = shape.parts().get(partIndex);
        return view.partNames().getOrDefault(id, id);
    }

    private static CommentMemberResponse member(Member m) {
        if (m == null) {
            return null;
        }
        return CommentMemberResponse.builder()
                .id(m.getId())
                .name(ScoreCommentServiceImpl.displayName(m))
                .avatarUrl(m.getAvatarUrl())
                .build();
    }

    // ------------------------------------------------------------------------------------------------ truy vấn, file

    private Score findScore(String scoreId) {
        return scoreRepository
                .findById(scoreId == null ? "" : scoreId)
                .orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
    }

    private ScoreSuggestion findSuggestion(String id) {
        return suggestionRepository
                .findById(id == null ? "" : id)
                .orElseThrow(() -> new AppException(ErrorCode.SUGGESTION_NOT_EXISTED));
    }

    private ScoreSuggestion lock(String id) {
        return suggestionRepository
                .findByIdForUpdate(id == null ? "" : id)
                .orElseThrow(() -> new AppException(ErrorCode.SUGGESTION_NOT_EXISTED));
    }

    private Member currentMember() {
        return memberRepository
                .findByEmail(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
    }

    /** Chuỗi tùy chọn: cắt khoảng trắng, rỗng là null, quá {@code max} ký tự là SUGGESTION_FIELDS_INVALID. */
    private static String cleanOptional(String text, int max) {
        String clean = text == null ? "" : text.strip();
        if (clean.length() > max) {
            throw new AppException(ErrorCode.SUGGESTION_FIELDS_INVALID);
        }
        return clean.isEmpty() ? null : clean;
    }

    private byte[] readUpload(MultipartFile file) {
        if (file == null || file.isEmpty() || file.getSize() > maxMusicXmlBytes) {
            throw new AppException(ErrorCode.FILE_TOO_LARGE);
        }
        try {
            return file.getBytes();
        } catch (IOException e) {
            log.error("Không đọc được file đề xuất tải lên", e);
            throw new AppException(ErrorCode.FILE_STORAGE_ERROR);
        }
    }

    /** Đọc file MusicXML của đề xuất: FILE_NOT_EXISTED (2002) nếu đã dọn hoặc mất trên đĩa. */
    private byte[] readProposalFile(ScoreSuggestion suggestion) {
        if (suggestion.getStoragePath() == null) {
            throw new AppException(ErrorCode.FILE_NOT_EXISTED);
        }
        try {
            return Files.readAllBytes(fileStorageService.resolve(suggestion.getStoragePath()));
        } catch (IOException e) {
            log.warn("Không đọc được file đề xuất {}: {}", suggestion.getId(), e.getMessage());
            throw new AppException(ErrorCode.FILE_NOT_EXISTED);
        }
    }

    /** Transaction hoàn tác thì xóa file vừa ghi. Ngoài transaction (ví dụ test) thì không đăng ký. */
    private void deleteOnRollback(String path) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status != STATUS_COMMITTED) {
                    deleteQuietly(path);
                }
            }
        });
    }

    /** Xóa file sau khi transaction commit; ngoài transaction thì xóa ngay. */
    private void deleteAfterCommit(List<String> paths) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            paths.forEach(this::deleteQuietly);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                paths.forEach(SuggestionServiceImpl.this::deleteQuietly);
            }
        });
    }

    private void deleteQuietly(String path) {
        try {
            fileStorageService.delete(path);
        } catch (RuntimeException e) {
            log.warn("Không xóa được file {}: {}", path, e.getMessage());
        }
    }
}
