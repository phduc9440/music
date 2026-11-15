package com.ptit.music_be.service.collab.live;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.ptit.music_be.dto.enums.score.ScoreAccess;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.service.billing.EntitlementService;
import com.ptit.music_be.service.permission.AccessDecision;
import com.ptit.music_be.service.permission.ScorePermissionService;

/**
 * Hỏi quyền của một người trên bản nhạc từ luồng WebSocket. Quyền vẫn do {@link ScorePermissionService} quyết định (nơi
 * duy nhất); lớp này chỉ dựng ngữ cảnh đăng nhập và giao dịch mà nó cần, vì luồng WebSocket không có hai thứ đó.
 */
@Component
public class LiveAccess {

    /**
     * Quyền của một người trên một bản nhạc.
     *
     * @param ownerId id chủ bản nhạc (null với bản không chủ), dùng để tra gói
     * @param memberId id người hỏi
     */
    public record Access(String scoreId, String ownerId, String memberId, String memberName, boolean canEdit) {}

    private final LiveSecurity security;
    private final ScoreRepository scoreRepository;
    private final MemberRepository memberRepository;
    private final ScorePermissionService permissionService;
    private final EntitlementService entitlementService;
    private final TransactionTemplate readOnly;
    private final boolean requireCollabPlan;

    public LiveAccess(
            LiveSecurity security,
            ScoreRepository scoreRepository,
            MemberRepository memberRepository,
            ScorePermissionService permissionService,
            EntitlementService entitlementService,
            PlatformTransactionManager transactionManager,
            @Value("${app.live.require-collab-plan:false}") boolean requireCollabPlan) {
        this.security = security;
        this.scoreRepository = scoreRepository;
        this.memberRepository = memberRepository;
        this.permissionService = permissionService;
        this.entitlementService = entitlementService;
        this.readOnly = new TransactionTemplate(transactionManager);
        this.readOnly.setReadOnly(true);
        this.requireCollabPlan = requireCollabPlan;
    }

    /**
     * Quyền của {@code email} trên bản nhạc.
     *
     * @throws AppException SCORE_NOT_EXISTED (2001) nếu không có hoặc đã vào thùng rác; UNAUTHORIZED (1002) nếu không
     *     xem được
     */
    public Access resolve(String email, String scoreId) {
        return security.runAs(email, () -> readOnly.execute(status -> {
            Score score = scoreRepository
                    .findById(scoreId)
                    .orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
            AccessDecision decision = permissionService.resolve(score);
            if (!decision.can(ScoreAccess.VIEW)) {
                throw new AppException(ErrorCode.UNAUTHORIZED);
            }
            Member member = memberRepository
                    .findByEmail(email)
                    .orElseThrow(() -> new AppException(ErrorCode.UNAUTHENTICATED));
            String ownerId = score.getMember() == null ? null : score.getMember().getId();
            return new Access(
                    scoreId, ownerId, member.getId(), member.getFullName(), permissionService.canEdit(score, decision));
        }));
    }

    /**
     * Gói của chủ bản nhạc có cho đồng chỉnh sửa không. Mặc định tắt kiểm tra ({@code app.live.require-collab-plan=false})
     * để demo chạy với mọi tài khoản; bật khi muốn áp đúng gói.
     *
     * @throws AppException LIVE_COLLAB_NOT_AVAILABLE (3123)
     */
    public void requireCollab(Access access) {
        if (!requireCollabPlan || access.ownerId() == null) {
            return;
        }
        if (!Boolean.TRUE.equals(entitlementService.limitsOf(access.ownerId()).collab())) {
            throw new AppException(ErrorCode.LIVE_COLLAB_NOT_AVAILABLE);
        }
    }
}
