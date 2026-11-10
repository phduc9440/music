package com.ptit.music_be.service.home.impl;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.ptit.music_be.dto.enums.FileType;
import com.ptit.music_be.dto.enums.Visibility;
import com.ptit.music_be.dto.response.ComposerResponse;
import com.ptit.music_be.dto.response.HomeSummaryResponse;
import com.ptit.music_be.dto.response.PageResponse;
import com.ptit.music_be.dto.response.PublicHomeResponse;
import com.ptit.music_be.dto.response.ScoreSummaryResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.MemberScore;
import com.ptit.music_be.entity.OfficialRequest;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.HomeQueryRepository;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.OfficialRequestRepository;
import com.ptit.music_be.repository.ScoreFileRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.composer.ComposerService;
import com.ptit.music_be.service.home.HomeService;
import com.ptit.music_be.service.practice.PracticeStatsService;
import com.ptit.music_be.service.score.ScoreService;
import com.ptit.music_be.service.storage.FileStorageService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class HomeServiceImpl implements HomeService {

    static final long PUBLIC_CACHE_MILLIS = 5 * 60 * 1000L;
    static final int FEATURED_SIZE = 8;
    static final int COMPOSER_SIZE = 6;
    static final int RECENT_SIZE = 3;
    static final int PENDING_SIZE = 5;

    static final String ACCESS_REQUEST = "ACCESS_REQUEST";
    static final String OFFICIAL_REQUEST = "OFFICIAL_REQUEST";

    private final HomeQueryRepository homeQueryRepository;
    private final ScoreService scoreService;
    private final ScoreRepository scoreRepository;
    private final ScoreFileRepository scoreFileRepository;
    private final MemberRepository memberRepository;
    private final OfficialRequestRepository officialRequestRepository;
    private final PracticeStatsService practiceStatsService;
    private final FileStorageService fileStorageService;
    private final ComposerService composerService;

    /** Trang chủ khách giống nhau cho mọi người nên nhớ một bản trong bộ nhớ (mỗi máy chủ một bản). */
    private volatile CachedHome cachedHome;

    private record CachedHome(PublicHomeResponse value, long expiresAt) {}

    @Override
    public PublicHomeResponse getPublicHome() {
        CachedHome cached = cachedHome;
        long now = System.currentTimeMillis();
        if (cached != null && cached.expiresAt() > now) {
            return cached.value();
        }
        PublicHomeResponse fresh = buildPublicHome();
        cachedHome = new CachedHome(fresh, now + PUBLIC_CACHE_MILLIS);
        return fresh;
    }

    /** Bỏ bản đang nhớ (dùng trong test). */
    void evictPublicHome() {
        cachedHome = null;
    }

    /** Mỗi câu truy vấn chạy trong transaction riêng của nó (ScoreService, repository). */
    PublicHomeResponse buildPublicHome() {
        PageResponse<ScoreSummaryResponse> featured =
                scoreService.getPublicScores(0, FEATURED_SIZE, null, null, null, "VIEWS");
        // Ảnh trong thẻ phải tải được khi chưa đăng nhập: dùng đường ảnh công khai thay cho /api/files/... cần quyền
        for (ScoreSummaryResponse card : featured.getContent()) {
            if (card.getThumbnailUrl() != null) {
                card.setThumbnailUrl("/api/public/scores/" + card.getId() + "/thumbnail");
            }
        }

        List<ComposerResponse> composers = composerService.listPublic(null, null, COMPOSER_SIZE);

        PublicHomeResponse.Stats stats = PublicHomeResponse.Stats.builder()
                .scores(homeQueryRepository.countScores())
                .publicScores(homeQueryRepository.countPublicScores())
                .digitizedPages(homeQueryRepository.sumDigitizedPages())
                .practiceHours(homeQueryRepository.sumPracticeSeconds() / 3600)
                .members(homeQueryRepository.countMembers())
                .build();

        return PublicHomeResponse.builder()
                .featured(featured.getContent())
                .composers(composers)
                .stats(stats)
                .generatedAt(LocalDateTime.now())
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public HomeSummaryResponse getSummary() {
        Member me = memberRepository
                .findByEmail(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));

        List<ScoreSummaryResponse> recent = scoreService
                .getMyScores(0, RECENT_SIZE, null, null, null, null, null, null) // cập nhật gần nhất trước
                .getContent();

        // Việc chờ tôi xử lý: yêu cầu xin quyền và lời xin đưa vào kho mẫu, gộp lại theo thời gian
        List<HomeSummaryResponse.PendingItem> pending = new ArrayList<>();
        for (MemberScore ms :
                homeQueryRepository.pendingAccessRequestsOfOwner(me.getId(), PageRequest.of(0, PENDING_SIZE))) {
            pending.add(HomeSummaryResponse.PendingItem.builder()
                    .type(ACCESS_REQUEST)
                    .scoreId(ms.getScore().getId())
                    .scoreTitle(ms.getScore().getTitle())
                    .actorName(displayName(ms.getMember()))
                    .permission(ms.getRequestedPermission().name())
                    .createdAt(ms.getRequestedAt())
                    .build());
        }
        List<OfficialRequest> officialRequests = officialRequestRepository.findPendingOfOwner(me.getId());
        for (OfficialRequest r : officialRequests.subList(0, Math.min(PENDING_SIZE, officialRequests.size()))) {
            pending.add(HomeSummaryResponse.PendingItem.builder()
                    .type(OFFICIAL_REQUEST)
                    .scoreId(r.getScore().getId())
                    .scoreTitle(r.getScore().getTitle())
                    .actorName(displayName(r.getRequestedBy()))
                    .createdAt(r.getCreatedAt())
                    .build());
        }
        pending.sort(Comparator.comparing(
                HomeSummaryResponse.PendingItem::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())));
        if (pending.size() > PENDING_SIZE) {
            pending = new ArrayList<>(pending.subList(0, PENDING_SIZE));
        }

        return HomeSummaryResponse.builder()
                .displayName(displayName(me))
                .streak(practiceStatsService.getStreak())
                .todayPracticeSeconds(homeQueryRepository.sumPracticeSecondsSince(
                        me.getId(), LocalDate.now().atStartOfDay()))
                .recentScores(recent)
                .pending(pending)
                .accessRequestCount(homeQueryRepository.countPendingAccessRequestsOfOwner(me.getId()))
                .officialRequestCount(officialRequests.size())
                .pendingPublicCount(homeQueryRepository.countPendingPublicOfOwner(me.getId()))
                .suggestion(suggestion(me))
                .build();
    }

    /** Tập tiếp bản tập gần nhất; người chưa tập lần nào thì gợi ý bài dễ nhất trong kho mẫu. */
    private HomeSummaryResponse.Suggestion suggestion(Member me) {
        List<Score> last = homeQueryRepository.lastPracticedScores(me.getId(), PageRequest.of(0, 1));
        if (!last.isEmpty()) {
            return HomeSummaryResponse.Suggestion.builder()
                    .reason("CONTINUE")
                    .score(toCard(last.get(0)))
                    .build();
        }
        List<ScoreSummaryResponse> official =
                scoreService.getOfficialScores(0, 1, null, null).getContent();
        if (official.isEmpty()) {
            return null;
        }
        return HomeSummaryResponse.Suggestion.builder()
                .reason("OFFICIAL")
                .score(official.get(0))
                .build();
    }

    private static ScoreSummaryResponse toCard(Score score) {
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
                .createdAt(score.getCreatedAt())
                .updatedAt(score.getUpdatedAt())
                .build();
    }

    private static String displayName(Member member) {
        if (member == null) {
            return null;
        }
        return StringUtils.hasText(member.getFullName()) ? member.getFullName() : member.getEmail();
    }

    @Override
    @Transactional(readOnly = true)
    public Thumbnail loadPublicThumbnail(String scoreId) {
        Score score =
                scoreRepository.findById(scoreId).orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
        if (!Visibility.PUBLIC.name().equals(score.getVisibility())) {
            // Không cho biết bản riêng tư có tồn tại hay không
            throw new AppException(ErrorCode.SCORE_NOT_EXISTED);
        }
        ScoreFile file = scoreFileRepository
                .findByScoreIdInAndFileTypeInAndPageNumber(
                        List.of(scoreId), List.of(FileType.PNG, FileType.ORIGINAL_IMAGE), 1)
                .stream()
                .min(Comparator.comparing(f -> f.getFileType() == FileType.PNG ? 0 : 1))
                .orElseThrow(() -> new AppException(ErrorCode.FILE_NOT_EXISTED));
        String contentType = file.getContentType() != null ? file.getContentType() : "image/png";
        return new Thumbnail(fileStorageService.loadAsResource(file.getStoragePath()), contentType);
    }
}
