package com.ptit.music_be.service.impl;

import java.util.List;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.MemberStatus;
import com.ptit.music_be.dto.enums.NotificationType;
import com.ptit.music_be.dto.request.AnnouncementRequest;
import com.ptit.music_be.dto.response.AnnouncementResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.service.AdminAnnouncementService;
import com.ptit.music_be.service.NotificationService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@PreAuthorize("hasRole('ADMIN')")
public class AdminAnnouncementServiceImpl implements AdminAnnouncementService {

    MemberRepository memberRepository;
    NotificationService notificationService;

    @Override
    @Transactional
    public AnnouncementResponse send(AnnouncementRequest request) {
        String message =
                request.getMessage() == null ? "" : request.getMessage().trim();
        if (message.isEmpty() || request.getAudience() == null) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
        Member me =
                memberRepository.findByEmail(SecurityUtils.getCurrentEmail()).orElse(null);

        List<Member> recipients =
                switch (request.getAudience()) {
                    case ALL -> memberRepository.findAllByStatus(MemberStatus.ACTIVE);
                    case USERS -> memberRepository.findNonAdminsByStatus(MemberStatus.ACTIVE);
                    case ADMINS -> memberRepository.findAllAdmins().stream()
                            .filter(m -> m.getStatus() == MemberStatus.ACTIVE)
                            .toList();
                    case SELECTED -> {
                        List<String> ids = request.getMemberIds() == null
                                ? List.of()
                                : request.getMemberIds().stream()
                                        .filter(id -> id != null && !id.isBlank())
                                        .distinct()
                                        .toList();
                        if (ids.isEmpty()) {
                            throw new AppException(ErrorCode.INVALID_REQUEST);
                        }
                        // Tài khoản đã bị khóa hoặc không còn tồn tại thì bỏ qua, giống các nhóm khác
                        yield memberRepository.findAllById(ids).stream()
                                .filter(m -> m.getStatus() == MemberStatus.ACTIVE)
                                .toList();
                    }
                };

        int sent = notificationService.notifyAll(recipients, me, NotificationType.ANNOUNCEMENT, message);
        return AnnouncementResponse.builder().recipients(sent).build();
    }
}
