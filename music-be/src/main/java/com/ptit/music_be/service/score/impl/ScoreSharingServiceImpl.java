package com.ptit.music_be.service.score.impl;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.NotificationType;
import com.ptit.music_be.dto.enums.SharePermission;
import com.ptit.music_be.dto.enums.ShareSource;
import com.ptit.music_be.dto.response.AccessRequestResponse;
import com.ptit.music_be.dto.response.MyAccessResponse;
import com.ptit.music_be.dto.response.ScoreSharingResponse;
import com.ptit.music_be.dto.response.ShareMemberResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.MemberScore;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.MemberScoreRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.notification.NotificationService;
import com.ptit.music_be.service.score.ScoreFileService;
import com.ptit.music_be.service.score.ScoreSharingService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class ScoreSharingServiceImpl implements ScoreSharingService {

    ScoreRepository scoreRepository;
    MemberRepository memberRepository;
    MemberScoreRepository memberScoreRepository;
    ScoreFileService scoreFileService;
    NotificationService notificationService;

    @Override
    @Transactional(readOnly = true)
    public ScoreSharingResponse getSharing(String scoreId) {
        Score score = findManageableScore(scoreId);
        return toResponse(score);
    }

    @Override
    @Transactional
    public ScoreSharingResponse addMember(String scoreId, String email, SharePermission permission) {
        Score score = findManageableScore(scoreId);
        Member member = memberRepository
                .findByEmail(email.trim())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
        if (isOwnerOf(score, member)) {
            throw new AppException(ErrorCode.CANNOT_SHARE_WITH_OWNER);
        }
        MemberScore share = memberScoreRepository
                .findByScoreIdAndMemberId(scoreId, member.getId())
                .orElseGet(
                        () -> MemberScore.builder().score(score).member(member).build());
        share.setPermission(permission);
        share.setSource(ShareSource.DIRECT);
        clearRequestIfSatisfied(share);
        memberScoreRepository.save(share);
        notificationService.notify(
                member,
                currentMember(),
                NotificationType.SHARED_WITH_YOU,
                scoreId,
                "Bạn được chia sẻ bản nhạc \"" + score.getTitle() + "\" với quyền " + label(permission));
        return toResponse(score);
    }

    @Override
    @Transactional
    public ScoreSharingResponse updateMember(String scoreId, String memberId, SharePermission permission) {
        Score score = findManageableScore(scoreId);
        MemberScore share = memberScoreRepository
                .findByScoreIdAndMemberId(scoreId, memberId)
                .filter(ms -> ms.getPermission() != null)
                .orElseThrow(() -> new AppException(ErrorCode.SHARE_MEMBER_NOT_EXISTED));
        share.setPermission(permission);
        share.setSource(ShareSource.DIRECT); // chủ đã chủ động chỉnh cấp thì coi như cấp trực tiếp
        clearRequestIfSatisfied(share);
        memberScoreRepository.save(share);
        return toResponse(score);
    }

    @Override
    @Transactional
    public ScoreSharingResponse removeMember(String scoreId, String memberId) {
        Score score = findManageableScore(scoreId);
        MemberScore share = memberScoreRepository
                .findByScoreIdAndMemberId(scoreId, memberId)
                .filter(ms -> ms.getPermission() != null)
                .orElseThrow(() -> new AppException(ErrorCode.SHARE_MEMBER_NOT_EXISTED));
        memberScoreRepository.delete(share);
        return toResponse(score);
    }

    // ------------------------------------------------------------------ xin quyền

    @Override
    @Transactional
    public MyAccessResponse requestAccess(String scoreId, SharePermission permission, String message) {
        if (permission != SharePermission.VIEW && permission != SharePermission.EDIT) {
            throw new AppException(ErrorCode.SHARE_PERMISSION_INVALID); // chỉ xin xem hoặc chỉnh sửa
        }
        Score score =
                scoreRepository.findById(scoreId).orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
        // Đã có quyền bằng hoặc cao hơn cấp đang xin (kể cả chủ sở hữu, ADMIN; bản PUBLIC thì mặc định đã xem và nhận
        // xét được) thì không cần xin
        String current = scoreFileService.getAccessLevel(score);
        if ("OWNER".equals(current)
                || (current != null && SharePermission.valueOf(current).includes(permission))) {
            throw new AppException(ErrorCode.ALREADY_HAS_ACCESS);
        }

        Member me = memberRepository
                .findByEmail(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
        MemberScore share = memberScoreRepository
                .findByScoreIdAndMemberId(scoreId, me.getId())
                .orElseGet(() -> MemberScore.builder().score(score).member(me).build());
        share.setRequestedPermission(permission);
        share.setRequestMessage(message == null || message.isBlank() ? null : message.trim());
        share.setRequestedAt(LocalDateTime.now());
        memberScoreRepository.save(share);
        notificationService.notify(
                score.getMember(),
                me,
                NotificationType.ACCESS_REQUESTED,
                scoreId,
                displayName(me) + " xin quyền " + label(permission) + " bản nhạc \"" + score.getTitle() + "\"");
        return MyAccessResponse.builder()
                .accessLevel(current)
                .requestedPermission(permission)
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public MyAccessResponse getMyAccess(String scoreId) {
        Score score =
                scoreRepository.findById(scoreId).orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
        SharePermission requested = memberScoreRepository
                .findByScoreIdAndMemberEmail(scoreId, SecurityUtils.getCurrentEmail())
                .map(MemberScore::getRequestedPermission)
                .orElse(null);
        return MyAccessResponse.builder()
                .accessLevel(scoreFileService.getAccessLevel(score))
                .requestedPermission(requested)
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public List<AccessRequestResponse> getAccessRequests(String scoreId) {
        findManageableScore(scoreId);
        return memberScoreRepository.findPendingByScoreIdFetchMember(scoreId).stream()
                .map(ms -> AccessRequestResponse.builder()
                        .memberId(ms.getMember().getId())
                        .email(ms.getMember().getEmail())
                        .fullName(ms.getMember().getFullName())
                        .requestedPermission(ms.getRequestedPermission())
                        .currentPermission(ms.getPermission())
                        .message(ms.getRequestMessage())
                        .requestedAt(ms.getRequestedAt())
                        .build())
                .toList();
    }

    @Override
    @Transactional
    public ScoreSharingResponse approveRequest(String scoreId, String memberId, SharePermission granted) {
        Score score = findManageableScore(scoreId);
        MemberScore share = findPendingRequest(scoreId, memberId);
        share.setPermission(granted != null ? granted : share.getRequestedPermission());
        share.setSource(ShareSource.DIRECT);
        clearRequest(share);
        memberScoreRepository.save(share);
        notificationService.notify(
                share.getMember(),
                currentMember(),
                NotificationType.ACCESS_APPROVED,
                scoreId,
                "Yêu cầu của bạn đã được đồng ý: quyền " + label(share.getPermission()) + " bản nhạc \""
                        + score.getTitle() + "\"");
        return toResponse(score);
    }

    @Override
    @Transactional
    public ScoreSharingResponse rejectRequest(String scoreId, String memberId) {
        Score score = findManageableScore(scoreId);
        MemberScore share = findPendingRequest(scoreId, memberId);
        Member requester = share.getMember();
        if (share.getPermission() == null) {
            memberScoreRepository.delete(share); // chưa có quyền gì thì không còn lý do giữ dòng này
        } else {
            clearRequest(share);
            memberScoreRepository.save(share);
        }
        notificationService.notify(
                requester,
                currentMember(),
                NotificationType.ACCESS_REJECTED,
                scoreId,
                "Yêu cầu xin quyền bản nhạc \"" + score.getTitle() + "\" của bạn đã bị từ chối");
        return toResponse(score);
    }

    private MemberScore findPendingRequest(String scoreId, String memberId) {
        return memberScoreRepository
                .findByScoreIdAndMemberId(scoreId, memberId)
                .filter(ms -> ms.getRequestedPermission() != null)
                .orElseThrow(() -> new AppException(ErrorCode.ACCESS_REQUEST_NOT_EXISTED));
    }

    private static void clearRequest(MemberScore share) {
        share.setRequestedPermission(null);
        share.setRequestMessage(null);
        share.setRequestedAt(null);
    }

    /** Quyền đã được cấp bằng hoặc cao hơn cấp đang xin thì yêu cầu coi như xong, xóa đi. */
    private static void clearRequestIfSatisfied(MemberScore share) {
        if (share.getRequestedPermission() != null
                && share.getPermission() != null
                && share.getPermission().includes(share.getRequestedPermission())) {
            clearRequest(share);
        }
    }

    // ------------------------------------------------------------------ helpers

    private Score findManageableScore(String scoreId) {
        Score score =
                scoreRepository.findById(scoreId).orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
        scoreFileService.checkCanManageSharing(score);
        return score;
    }

    private ScoreSharingResponse toResponse(Score score) {
        List<ShareMemberResponse> members = memberScoreRepository.findByScoreIdFetchMember(score.getId()).stream()
                .map(ms -> ShareMemberResponse.builder()
                        .memberId(ms.getMember().getId())
                        .email(ms.getMember().getEmail())
                        .fullName(ms.getMember().getFullName())
                        .permission(ms.getPermission())
                        .source(ms.getSource())
                        .build())
                .toList();
        return ScoreSharingResponse.builder()
                .visibility(score.getVisibility())
                .members(members)
                .pendingRequests(memberScoreRepository.countByScoreIdAndRequestedPermissionIsNotNull(score.getId()))
                .build();
    }

    private Member currentMember() {
        return memberRepository.findByEmail(SecurityUtils.getCurrentEmail()).orElse(null);
    }

    private static String displayName(Member m) {
        return m.getFullName() != null && !m.getFullName().isBlank() ? m.getFullName() : m.getEmail();
    }

    private static String label(SharePermission p) {
        return switch (p) {
            case VIEW -> "xem";
            case REVIEW -> "nhận xét";
            case EDIT -> "chỉnh sửa";
        };
    }

    private boolean isOwnerOf(Score score, Member member) {
        return score.getMember() != null && score.getMember().getId().equals(member.getId());
    }
}
