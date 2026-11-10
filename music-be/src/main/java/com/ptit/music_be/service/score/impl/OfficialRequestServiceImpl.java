package com.ptit.music_be.service.score.impl;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.ptit.music_be.configuration.ApplicationInitConfig;
import com.ptit.music_be.dto.enums.FileType;
import com.ptit.music_be.dto.enums.NotificationType;
import com.ptit.music_be.dto.enums.OfficialRequestStatus;
import com.ptit.music_be.dto.enums.ScoreSource;
import com.ptit.music_be.dto.enums.Visibility;
import com.ptit.music_be.dto.response.OfficialRequestResponse;
import com.ptit.music_be.dto.response.PageResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.OfficialRequest;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.OfficialRequestRepository;
import com.ptit.music_be.repository.ScoreFileRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.notification.NotificationService;
import com.ptit.music_be.service.score.CopyOptions;
import com.ptit.music_be.service.score.OfficialRequestService;
import com.ptit.music_be.service.score.ScoreCopyService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class OfficialRequestServiceImpl implements OfficialRequestService {

    static final int DEFAULT_PAGE_SIZE = 20;
    static final int MAX_PAGE_SIZE = 50;

    OfficialRequestRepository requestRepository;
    ScoreRepository scoreRepository;
    ScoreFileRepository scoreFileRepository;
    MemberRepository memberRepository;
    ScoreCopyService scoreCopyService;
    NotificationService notificationService;

    @Override
    @Transactional
    public OfficialRequestResponse request(String scoreId) {
        requireAdmin();
        Member admin = currentMember();
        Score score = scoreRepository.findById(scoreId).orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
        if (!Visibility.PUBLIC.name().equals(score.getVisibility())) {
            throw new AppException(ErrorCode.SCORE_NOT_PUBLIC_FOR_OFFICIAL);
        }
        if (Boolean.TRUE.equals(score.getIsOfficial())
                || requestRepository.hasLiveAcceptedCopy(scoreId)) {
            throw new AppException(ErrorCode.SCORE_ALREADY_OFFICIAL);
        }
        if (requestRepository.existsByScoreIdAndStatusIn(scoreId, Set.of(OfficialRequestStatus.PENDING))) {
            throw new AppException(ErrorCode.OFFICIAL_REQUEST_DUPLICATED);
        }
        Member owner = score.getMember();
        if (owner == null) {
            throw new AppException(ErrorCode.USER_NOT_EXISTED);
        }

        // Bản của tài khoản hệ thống: không có ai để xin phép, vào kho luôn
        if (ApplicationInitConfig.ROOT_ADMIN_EMAIL.equalsIgnoreCase(owner.getEmail())) {
            score.setIsOfficial(true);
            scoreRepository.save(score);
            return toResponse(
                    requestRepository.save(OfficialRequest.builder()
                            .score(score)
                            .requestedBy(admin)
                            .owner(owner)
                            .status(OfficialRequestStatus.ACCEPTED)
                            .copyScoreId(score.getId())
                            .resolvedAt(LocalDateTime.now())
                            .build()),
                    false);
        }

        // Cần MusicXML để sao chép; kiểm tra ngay từ lúc xin để không xin những bản mà chủ có đồng ý cũng không chép được
        if (scoreFileRepository
                .findByScoreIdAndFileTypeOrderByPageNumberAsc(scoreId, FileType.MUSICXML)
                .isEmpty()) {
            throw new AppException(ErrorCode.MUSICXML_NOT_READY);
        }
        OfficialRequest saved = requestRepository.save(OfficialRequest.builder()
                .score(score)
                .requestedBy(admin)
                .owner(owner)
                .status(OfficialRequestStatus.PENDING)
                .build());
        notificationService.notify(
                owner,
                admin,
                NotificationType.OFFICIAL_REQUESTED,
                score.getId(),
                "Quản trị viên muốn đưa bản nhạc \"" + score.getTitle() + "\" vào kho score mẫu. "
                        + "Bản của bạn giữ nguyên, hệ thống chỉ sao chép một bản và ghi tên bạn là người phối. "
                        + "Hãy đồng ý hoặc từ chối.");
        return toResponse(saved, false);
    }

    @Override
    @Transactional(readOnly = true)
    public List<OfficialRequestResponse> getMine() {
        return requestRepository.findPendingOfOwner(currentMember().getId()).stream()
                .map(r -> toResponse(r, false))
                .toList();
    }

    @Override
    @Transactional
    public OfficialRequestResponse accept(String requestId) {
        OfficialRequest request = findPendingOfMine(requestId);
        Score score = request.getScore();
        if (!Visibility.PUBLIC.name().equals(score.getVisibility())) {
            // Chủ đã gỡ công khai trong lúc chờ: không đưa bản riêng tư vào kho
            throw new AppException(ErrorCode.SCORE_NOT_PUBLIC_FOR_OFFICIAL);
        }
        Member systemOwner = memberRepository
                .findByEmail(ApplicationInitConfig.ROOT_ADMIN_EMAIL)
                .orElseThrow(() -> new AppException(ErrorCode.SCORE_SYSTEM_OWNER_MISSING));

        Score copy = scoreCopyService.copy(score.getId(), systemOwner, copyOptions(score));
        copy.setVisibility(Visibility.PUBLIC.name());
        copy.setIsOfficial(true);
        copy.setOriginalScoreId(score.getId());
        copy.setArrangerName(displayName(request.getOwner()));
        scoreRepository.save(copy);

        request.setStatus(OfficialRequestStatus.ACCEPTED);
        request.setCopyScoreId(copy.getId());
        request.setResolvedAt(LocalDateTime.now());
        OfficialRequest saved = requestRepository.save(request);
        notificationService.notify(
                request.getRequestedBy(),
                request.getOwner(),
                NotificationType.OFFICIAL_ACCEPTED,
                copy.getId(),
                displayName(request.getOwner()) + " đã đồng ý đưa bản nhạc \"" + score.getTitle()
                        + "\" vào kho score mẫu");
        return toResponse(saved, false);
    }

    @Override
    @Transactional
    public OfficialRequestResponse decline(String requestId) {
        OfficialRequest request = findPendingOfMine(requestId);
        request.setStatus(OfficialRequestStatus.DECLINED);
        request.setResolvedAt(LocalDateTime.now());
        OfficialRequest saved = requestRepository.save(request);
        notificationService.notify(
                request.getRequestedBy(),
                request.getOwner(),
                NotificationType.OFFICIAL_DECLINED,
                request.getScore().getId(),
                displayName(request.getOwner()) + " đã từ chối đưa bản nhạc \"" + request.getScore().getTitle()
                        + "\" vào kho score mẫu");
        return toResponse(saved, false);
    }

    @Override
    @Transactional
    public OfficialRequestResponse cancel(String requestId) {
        requireAdmin();
        OfficialRequest request = requestRepository
                .findById(requestId)
                .orElseThrow(() -> new AppException(ErrorCode.OFFICIAL_REQUEST_NOT_EXISTED));
        if (request.getStatus() != OfficialRequestStatus.PENDING) {
            throw new AppException(ErrorCode.OFFICIAL_REQUEST_NOT_PENDING);
        }
        request.setStatus(OfficialRequestStatus.CANCELED);
        request.setResolvedAt(LocalDateTime.now());
        return toResponse(requestRepository.save(request), true);
    }

    @Override
    @Transactional(readOnly = true)
    public PageResponse<OfficialRequestResponse> getForAdmin(int page, int size, String status) {
        requireAdmin();
        int safeSize = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
        String safeStatus = "";
        if (StringUtils.hasText(status)) {
            try {
                safeStatus = OfficialRequestStatus.valueOf(status.trim().toUpperCase()).name();
            } catch (IllegalArgumentException e) {
                throw new AppException(ErrorCode.INVALID_FILTER);
            }
        }
        Page<OfficialRequest> result =
                requestRepository.searchForAdmin(safeStatus, PageRequest.of(Math.max(page, 0), safeSize));
        return PageResponse.<OfficialRequestResponse>builder()
                .content(result.getContent().stream().map(r -> toResponse(r, true)).toList())
                .pageNumber(result.getNumber())
                .pageSize(result.getSize())
                .totalElements(result.getTotalElements())
                .totalPages(result.getTotalPages())
                .build();
    }

    // ------------------------------------------------------------------ helpers

    private OfficialRequest findPendingOfMine(String requestId) {
        OfficialRequest request = requestRepository
                .findById(requestId)
                .orElseThrow(() -> new AppException(ErrorCode.OFFICIAL_REQUEST_NOT_EXISTED));
        // Người khác không được biết lời xin này có tồn tại hay không
        if (!request.getOwner().getId().equals(currentMember().getId())) {
            throw new AppException(ErrorCode.OFFICIAL_REQUEST_NOT_EXISTED);
        }
        if (request.getStatus() != OfficialRequestStatus.PENDING) {
            throw new AppException(ErrorCode.OFFICIAL_REQUEST_NOT_PENDING);
        }
        return request;
    }

    /** Giữ nguồn của bản gốc (số hóa / nhập file) để thẻ trong kho hiện đúng nhãn. */
    private static CopyOptions copyOptions(Score score) {
        ScoreSource source = null;
        try {
            if (score.getSourceType() != null) {
                source = ScoreSource.valueOf(score.getSourceType());
            }
        } catch (IllegalArgumentException ignored) {
            // nguồn lạ thì để mặc định
        }
        return new CopyOptions(null, source, true, true);
    }

    /** Tên hiển thị, không dùng email để không lộ địa chỉ của người dùng. */
    private static String displayName(Member member) {
        return StringUtils.hasText(member.getFullName()) ? member.getFullName().trim() : "Một người dùng";
    }

    private OfficialRequestResponse toResponse(OfficialRequest r, boolean forAdmin) {
        return OfficialRequestResponse.builder()
                .id(r.getId())
                .scoreId(r.getScore().getId())
                .scoreTitle(r.getScore().getTitle())
                .composer(r.getScore().getComposer())
                .status(r.getStatus())
                .requestedBy(
                        StringUtils.hasText(r.getRequestedBy().getFullName())
                                ? r.getRequestedBy().getFullName()
                                : r.getRequestedBy().getEmail())
                .ownerEmail(forAdmin ? r.getOwner().getEmail() : null)
                .copyScoreId(r.getCopyScoreId())
                .createdAt(r.getCreatedAt())
                .resolvedAt(r.getResolvedAt())
                .build();
    }

    private Member currentMember() {
        return memberRepository
                .findByEmail(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
    }

    private static void requireAdmin() {
        if (!SecurityUtils.isAdmin()) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
    }
}
