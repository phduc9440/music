package com.ptit.music_be.service.impl;

import java.util.List;
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
import com.ptit.music_be.dto.enums.MemberStatus;
import com.ptit.music_be.dto.request.AdminUpdateMemberRequest;
import com.ptit.music_be.dto.response.AdminMemberDetailResponse;
import com.ptit.music_be.dto.response.MemberResponse;
import com.ptit.music_be.dto.response.PageResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.MemberRole;
import com.ptit.music_be.entity.Role;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.mapper.MemberMapper;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.RoleRepository;
import com.ptit.music_be.service.AdminMemberService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@PreAuthorize("hasRole('ADMIN')")
public class AdminMemberServiceImpl implements AdminMemberService {

    static final String SUPER_ADMIN = "SUPER_ADMIN";
    static final int DEFAULT_PAGE_SIZE = 20;
    static final int MAX_PAGE_SIZE = 50;

    MemberRepository memberRepository;
    RoleRepository roleRepository;
    MemberMapper memberMapper;
    EntityManager entityManager;
    MemberStatusGuard memberStatusGuard;

    @Override
    @Transactional(readOnly = true)
    public PageResponse<MemberResponse> getMembers(int page, int size, String keyword) {
        int safeSize = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
        String safeKeyword = keyword == null || keyword.isBlank() ? null : keyword.trim();
        if (safeKeyword != null && safeKeyword.length() > 100) {
            safeKeyword = safeKeyword.substring(0, 100);
        }

        Page<Member> result = memberRepository.search(
                safeKeyword,
                PageRequest.of(Math.max(page, 0), safeSize, Sort.by("email").ascending()));

        return PageResponse.<MemberResponse>builder()
                .content(result.getContent().stream()
                        .map(memberMapper::toMemberResponse)
                        .toList())
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
                        "select new com.ptit.music_be.dto.response.AdminMemberDetailResponse$RecentScore("
                                + "s.id, s.title, s.composer, s.visibility, s.isOfficial, s.updatedAt)"
                                + " from Score s where s.member.id = :id order by s.updatedAt desc, s.id",
                        AdminMemberDetailResponse.RecentScore.class)
                .setParameter("id", id)
                .setMaxResults(10)
                .getResultList();
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
                .build();
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
