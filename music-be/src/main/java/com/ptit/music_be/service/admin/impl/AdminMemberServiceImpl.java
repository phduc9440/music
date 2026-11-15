package com.ptit.music_be.service.admin.impl;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import jakarta.persistence.EntityManager;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.configuration.MemberStatusGuard;
import com.ptit.music_be.dto.enums.auth.AdminPermission;
import com.ptit.music_be.dto.enums.auth.MemberStatus;
import com.ptit.music_be.dto.enums.billing.PaymentStatus;
import com.ptit.music_be.dto.request.admin.AdminUpdateMemberRequest;
import com.ptit.music_be.dto.response.admin.AdminMemberDetailResponse;
import com.ptit.music_be.dto.response.auth.MemberResponse;
import com.ptit.music_be.dto.response.billing.MemberPlanSummary;
import com.ptit.music_be.dto.response.common.PageResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.MemberRole;
import com.ptit.music_be.entity.Role;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.mapper.MemberMapper;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.auth.RoleRepository;
import com.ptit.music_be.service.admin.AdminMemberService;
import com.ptit.music_be.service.billing.SubscriptionService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@PreAuthorize("@perm.has('MEMBERS_VIEW')")
public class AdminMemberServiceImpl implements AdminMemberService {

    static final String SUPER_ADMIN = "SUPER_ADMIN";
    static final int DEFAULT_PAGE_SIZE = 20;
    static final int MAX_PAGE_SIZE = 50;
    static final int MAX_PURCHASES = 50;

    MemberRepository memberRepository;
    RoleRepository roleRepository;
    MemberMapper memberMapper;
    EntityManager entityManager;
    MemberStatusGuard memberStatusGuard;
    SubscriptionService subscriptionService;

    @Override
    @Transactional(readOnly = true)
    public PageResponse<MemberResponse> getMembers(int page, int size, String keyword) {
        return toPage(memberRepository.search(cleanKeyword(keyword), pageOf(page, size)));
    }

    @Override
    @Transactional(readOnly = true)
    public PageResponse<MemberResponse> getMembersWithPlan(
            int page, int size, String keyword, String planCode, boolean bannedOnly) {
        String code =
                planCode == null || planCode.isBlank() ? null : planCode.trim().toUpperCase();
        return toPage(memberRepository.searchWithPlan(
                cleanKeyword(keyword), code, bannedOnly, java.time.LocalDateTime.now(), pageOf(page, size)));
    }

    private static String cleanKeyword(String keyword) {
        String k = keyword == null || keyword.isBlank() ? null : keyword.trim();
        return k != null && k.length() > 100 ? k.substring(0, 100) : k;
    }

    private static PageRequest pageOf(int page, int size) {
        int safeSize = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
        return PageRequest.of(Math.max(page, 0), safeSize, Sort.by("email").ascending());
    }

    /** Đổi sang response kèm gói đang dùng của cả danh sách (một truy vấn). */
    private List<MemberResponse> withPlans(List<Member> members) {
        List<MemberResponse> content =
                members.stream().map(memberMapper::toMemberResponse).toList();
        Map<String, Set<String>> roles = new HashMap<>();
        content.forEach(m -> roles.put(m.getId(), m.getRoles()));
        Map<String, MemberPlanSummary> plans = subscriptionService.plansOf(roles);
        content.forEach(m -> m.setPlan(plans.get(m.getId())));
        return content;
    }

    /** Trang thành viên kèm gói đang dùng của cả trang (một truy vấn). */
    private PageResponse<MemberResponse> toPage(Page<Member> result) {
        return PageResponse.<MemberResponse>builder()
                .content(withPlans(result.getContent()))
                .pageNumber(result.getNumber())
                .pageSize(result.getSize())
                .totalElements(result.getTotalElements())
                .totalPages(result.getTotalPages())
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public MemberResponse getMember(String memberId) {
        return memberMapper.toMemberResponse(find(memberId));
    }

    @Override
    @Transactional(readOnly = true)
    public AdminMemberDetailResponse getMemberDetail(String memberId) {
        Member member = find(memberId);
        String id = member.getId();
        long scores = count("select count(s) from Score s where s.member.id = :id", id);
        long seconds = entityManager
                .createQuery(
                        "select coalesce(sum(p.durationSeconds), 0) from PracticeSession p where p.member.id = :id",
                        Number.class)
                .setParameter("id", id)
                .getSingleResult()
                .longValue();
        List<AdminMemberDetailResponse.RecentScore> recent = entityManager
                .createQuery(
                        "select new com.ptit.music_be.dto.response.admin.AdminMemberDetailResponse$RecentScore("
                                + "s.id, s.title, s.composer, s.visibility, s.isOfficial, s.updatedAt)"
                                + " from Score s where s.member.id = :id order by s.updatedAt desc, s.id",
                        AdminMemberDetailResponse.RecentScore.class)
                .setParameter("id", id)
                .setMaxResults(10)
                .getResultList();
        long[] paid = paidSum(id, PaymentStatus.PAID);
        long[] refunded = paidSum(id, PaymentStatus.REFUNDED);
        return AdminMemberDetailResponse.builder()
                .member(memberMapper.toMemberResponse(member))
                .scoreCount(scores)
                .publicScores(
                        count("select count(s) from Score s where s.member.id = :id and s.visibility = 'PUBLIC'", id))
                .pendingScores(
                        count("select count(s) from Score s where s.member.id = :id and s.visibility = 'PENDING'", id))
                .playlistCount(count("select count(p) from Playlist p where p.member.id = :id", id))
                .reviewCount(count("select count(r) from ScoreReview r where r.member.id = :id", id))
                .practiceSessions(count("select count(p) from PracticeSession p where p.member.id = :id", id))
                .practiceMinutes(Math.round(seconds / 6.0) / 10.0)
                .recentScores(recent)
                .purchaseTotal(paid[0])
                .purchaseCount(paid[1])
                .refundedTotal(refunded[0])
                .refundedCount(refunded[1])
                .purchases(purchases(id))
                .teams(teams(id))
                .build();
    }

    /** Team người này đang ở: đang hoạt động trước, team đã xóa mềm sau; số thành viên đếm thẳng từ team_members. */
    private List<AdminMemberDetailResponse.TeamRow> teams(String memberId) {
        return entityManager
                .createQuery(
                        "select new com.ptit.music_be.dto.response.admin.AdminMemberDetailResponse$TeamRow("
                                + "t.id, t.name, str(tm.role), tm.joinedAt,"
                                + " (select count(m) from TeamMember m where m.team = t and m.kind = 'MEMBER'),"
                                + " t.deletedAt)"
                                + " from TeamMember tm join tm.team t where tm.kind = 'MEMBER' and tm.member.id = :id"
                                + " order by case when t.deletedAt is null then 0 else 1 end, t.name",
                        AdminMemberDetailResponse.TeamRow.class)
                .setParameter("id", memberId)
                .setMaxResults(50)
                .getResultList();
    }

    /** {tổng tiền, số đơn} các đơn mua gói của thành viên ở trạng thái status (tính thẳng từ payment_orders). */
    private long[] paidSum(String memberId, PaymentStatus status) {
        Object[] r = entityManager
                .createQuery(
                        "select coalesce(sum(o.amount), 0), count(o) from PaymentOrder o"
                                + " where o.member.id = :id and o.status = :status",
                        Object[].class)
                .setParameter("id", memberId)
                .setParameter("status", status)
                .getSingleResult();
        return new long[] {((Number) r[0]).longValue(), ((Number) r[1]).longValue()};
    }

    /** Các lần mua gói đã thanh toán (kể cả đã hoàn tiền), mới nhất trước. */
    private List<AdminMemberDetailResponse.Purchase> purchases(String memberId) {
        return entityManager
                .createQuery(
                        "select new com.ptit.music_be.dto.response.admin.AdminMemberDetailResponse$Purchase("
                                + "o.orderCode, o.plan.name, cast(o.period as string), cast(o.kind as string),"
                                + " cast(o.status as string), o.amount, o.paidAt)"
                                + " from PaymentOrder o where o.member.id = :id and o.status in :statuses"
                                + " and o.paidAt is not null order by o.paidAt desc",
                        AdminMemberDetailResponse.Purchase.class)
                .setParameter("id", memberId)
                .setParameter("statuses", List.of(PaymentStatus.PAID, PaymentStatus.REFUNDED))
                .setMaxResults(MAX_PURCHASES)
                .getResultList();
    }

    private long count(String jpql, String memberId) {
        return entityManager
                .createQuery(jpql, Long.class)
                .setParameter("id", memberId)
                .getSingleResult();
    }

    @Override
    @Transactional
    public MemberResponse updateMember(String memberId, AdminUpdateMemberRequest request) {
        Member member = find(memberId);
        boolean isSelf = member.getEmail().equals(SecurityUtils.getCurrentEmail());
        boolean targetIsSuper = hasRole(member, SUPER_ADMIN);
        // Chỉ SUPER_ADMIN được đụng đến tài khoản SUPER_ADMIN khác (khóa, đổi vai trò)
        if (targetIsSuper && !isSelf && !SecurityUtils.isSuperAdmin()) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }

        if (request.getStatus() != null) {
            SecurityUtils.requirePermission(AdminPermission.MEMBERS_LOCK);
            if (isSelf && request.getStatus() != MemberStatus.ACTIVE) {
                throw new AppException(ErrorCode.CANNOT_MODIFY_SELF);
            }
            member.setStatus(request.getStatus());
            memberStatusGuard.evict(member.getEmail()); // khóa có hiệu lực ngay, mở khóa cũng vậy
        }

        if (request.getRoles() != null) {
            Set<String> names = request.getRoles().stream()
                    .map(r -> r == null ? "" : r.trim().toUpperCase().replaceFirst("^ROLE_", ""))
                    .collect(Collectors.toSet());
            if (names.isEmpty()) {
                throw new AppException(ErrorCode.ROLE_NOT_EXISTED);
            }
            // Chỉ SUPER_ADMIN được cấp/thu hồi ADMIN; ADMIN thường không được đổi vai trò của ai
            if (!SecurityUtils.isSuperAdmin()) {
                throw new AppException(ErrorCode.UNAUTHORIZED);
            }
            // SUPER_ADMIN là tài khoản gốc do ApplicationInitConfig tạo, không cấp/thu hồi qua API
            if (names.contains(SUPER_ADMIN) != targetIsSuper) {
                throw new AppException(ErrorCode.UNAUTHORIZED);
            }
            if (isSelf) {
                throw new AppException(ErrorCode.CANNOT_MODIFY_SELF);
            }
            // orphanRemoval=true: bỏ role khỏi list thì dòng member_roles bị xóa
            member.getMemberRoles().removeIf(mr -> !names.contains(mr.getRole().getName()));
            Set<String> existing = member.getMemberRoles().stream()
                    .map(mr -> mr.getRole().getName())
                    .collect(Collectors.toSet());
            for (String name : names) {
                if (existing.contains(name)) continue;
                Role role =
                        roleRepository.findByName(name).orElseThrow(() -> new AppException(ErrorCode.ROLE_NOT_EXISTED));
                member.getMemberRoles()
                        .add(MemberRole.builder().member(member).role(role).build());
            }
            memberStatusGuard.evict(member.getEmail()); // vai trò mới có hiệu lực ngay, không cần đăng nhập lại
        }

        return memberMapper.toMemberResponse(memberRepository.save(member));
    }

    private static boolean hasRole(Member member, String roleName) {
        return member.getMemberRoles().stream()
                .anyMatch(mr -> roleName.equals(mr.getRole().getName()));
    }

    private Member find(String memberId) {
        return memberRepository.findById(memberId).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
    }
}
