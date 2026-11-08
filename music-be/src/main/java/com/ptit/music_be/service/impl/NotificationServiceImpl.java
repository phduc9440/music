package com.ptit.music_be.service.impl;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.NotificationType;
import com.ptit.music_be.dto.response.NotificationResponse;
import com.ptit.music_be.dto.response.PageResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Notification;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.NotificationRepository;
import com.ptit.music_be.service.NotificationService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class NotificationServiceImpl implements NotificationService {

    static final int MAX_PAGE_SIZE = 50;

    NotificationRepository notificationRepository;
    MemberRepository memberRepository;

    @Override
    @Transactional
    public void notify(Member recipient, Member actor, NotificationType type, String scoreId, String message) {
        if (recipient == null || (actor != null && recipient.getId().equals(actor.getId()))) {
            return;
        }
        notificationRepository.save(Notification.builder()
                .recipient(recipient)
                .type(type)
                .scoreId(scoreId)
                .message(truncate(message))
                .build());
    }

    @Override
    @Transactional
    public void notifyAdmins(Member actor, NotificationType type, String scoreId, String message) {
        for (Member admin : memberRepository.findAllAdmins()) {
            notify(admin, actor, type, scoreId, message);
        }
    }

    @Override
    @Transactional(readOnly = true)
    public PageResponse<NotificationResponse> getMine(int page, int size) {
        int safeSize = size <= 0 ? 20 : Math.min(size, MAX_PAGE_SIZE);
        Page<Notification> result = notificationRepository.findByRecipientEmailOrderByCreatedAtDesc(
                SecurityUtils.getCurrentEmail(), PageRequest.of(Math.max(page, 0), safeSize));
        return PageResponse.<NotificationResponse>builder()
                .content(result.getContent().stream().map(this::toResponse).toList())
                .pageNumber(result.getNumber())
                .pageSize(result.getSize())
                .totalElements(result.getTotalElements())
                .totalPages(result.getTotalPages())
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public long countUnread() {
        return notificationRepository.countByRecipientEmailAndReadFalse(SecurityUtils.getCurrentEmail());
    }

    @Override
    @Transactional
    public void markRead(String notificationId) {
        Notification n = notificationRepository
                .findById(notificationId)
                .filter(x -> x.getRecipient().getEmail().equals(SecurityUtils.getCurrentEmail()))
                .orElseThrow(() -> new AppException(ErrorCode.NOTIFICATION_NOT_EXISTED));
        n.setRead(true);
        notificationRepository.save(n);
    }

    @Override
    @Transactional
    public void markAllRead() {
        notificationRepository.markAllRead(SecurityUtils.getCurrentEmail());
    }

    private NotificationResponse toResponse(Notification n) {
        return NotificationResponse.builder()
                .id(n.getId())
                .type(n.getType())
                .scoreId(n.getScoreId())
                .message(n.getMessage())
                .read(n.isRead())
                .createdAt(n.getCreatedAt())
                .build();
    }

    private static String truncate(String s) {
        return s != null && s.length() > 500 ? s.substring(0, 500) : s;
    }
}
