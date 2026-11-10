package com.ptit.music_be.service.permission.impl;

import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.ScoreAccess;
import com.ptit.music_be.dto.enums.Visibility;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.MemberScore;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.MemberScoreRepository;
import com.ptit.music_be.service.permission.AccessDecision;
import com.ptit.music_be.service.permission.ScoreAccessAuditor;
import com.ptit.music_be.service.permission.ScorePermissionService;
import com.ptit.music_be.service.permission.TeamAccessResolver;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class ScorePermissionServiceImpl implements ScorePermissionService {

    MemberScoreRepository memberScoreRepository;
    MemberRepository memberRepository;
    TeamAccessResolver teamAccessResolver;
    ScoreAccessAuditor scoreAccessAuditor;

    @Override
    @Transactional(readOnly = true)
    public AccessDecision resolve(Score score) {
        String email = SecurityUtils.getCurrentEmail();
        boolean admin = SecurityUtils.isAdmin();
        boolean superAdmin = SecurityUtils.isSuperAdmin();

        // 1. Chủ sở hữu
        if (isOwner(score, email)) {
            return new AccessDecision(ScoreAccess.OWNER, false, superAdmin);
        }

        // 2. Mức cao nhất trong chia sẻ cá nhân, team và quyền nhận xét của bản công khai
        ScoreAccess level = shareLevel(score, email);
        level = ScoreAccess.max(level, teamLevel(score, email));
        String visibility = score.getVisibility();
        if (Visibility.PUBLIC.name().equals(visibility)) {
            level = ScoreAccess.max(level, ScoreAccess.REVIEW);
        }

        // 3. Kho mẫu: ADMIN sửa được
        if (admin && Boolean.TRUE.equals(score.getIsOfficial())) {
            level = ScoreAccess.max(level, ScoreAccess.EDIT);
        }

        // 4. ADMIN kiểm duyệt: chỉ xem bản đang PUBLIC hoặc PENDING, tuyệt đối không xem bản PRIVATE
        boolean moderator = false;
        if (admin
                && !level.includes(ScoreAccess.VIEW)
                && (Visibility.PUBLIC.name().equals(visibility)
                        || Visibility.PENDING.name().equals(visibility))) {
            level = ScoreAccess.VIEW;
            moderator = true;
        }

        // 5. SUPER_ADMIN không được cộng thêm quyền nào ở đây
        return new AccessDecision(level, moderator, superAdmin);
    }

    @Override
    public boolean canEdit(Score score, AccessDecision decision) {
        if (!decision.can(ScoreAccess.EDIT)) {
            return false;
        }
        // Bản kho mẫu là bản chuẩn của hệ thống: chủ sở hữu hay người được chia sẻ cũng không sửa được
        return !Boolean.TRUE.equals(score.getIsOfficial()) || SecurityUtils.isAdmin();
    }

    @Override
    public boolean canDelete(Score score, AccessDecision decision) {
        if (decision.level() == ScoreAccess.OWNER) {
            return true;
        }
        // ADMIN chỉ được xóa để kiểm duyệt: bản đang công khai hoặc chờ duyệt
        return SecurityUtils.isAdmin()
                && (Visibility.PUBLIC.name().equals(score.getVisibility())
                        || Visibility.PENDING.name().equals(score.getVisibility()));
    }

    @Override
    public void auditModeratorAccess(Score score, String action) {
        String email = SecurityUtils.getCurrentEmail();
        if (SecurityUtils.isAdmin() && !isOwner(score, email)) {
            scoreAccessAuditor.onModeratorAccess(score, email, action);
        }
    }

    private static boolean isOwner(Score score, String email) {
        return score.getMember() != null && email.equals(score.getMember().getEmail());
    }

    /** Quyền đã được cấp cho người này. Dòng mới chỉ có yêu cầu xin (permission null) thì chưa có quyền. */
    private ScoreAccess shareLevel(Score score, String email) {
        return memberScoreRepository
                .findByScoreIdAndMemberEmail(score.getId(), email)
                .map(MemberScore::getPermission)
                .map(ScoreAccess::of)
                .orElse(ScoreAccess.NONE);
    }

    private ScoreAccess teamLevel(Score score, String email) {
        Optional<String> memberId = memberRepository.findByEmail(email).map(Member::getId);
        if (memberId.isEmpty()) {
            return ScoreAccess.NONE;
        }
        return teamAccessResolver.resolve(score, memberId.get()).orElse(ScoreAccess.NONE);
    }
}
