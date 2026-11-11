package com.ptit.music_be.service.notification.impl;

import java.util.Map;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.enums.NotificationType;
import com.ptit.music_be.dto.response.NotificationResponse;
import com.ptit.music_be.dto.response.PageResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Notification;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.NotificationRepository;
import com.ptit.music_be.service.notification.NotificationService;
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
    ObjectMapper objectMapper;

    @Override
    @Transactional
    public void notify(
            Member recipient,
            Member actor,
            NotificationType type,
            String scoreId,
            String message,
            Map<String, String> params) {
        if (recipient == null || (actor != null && recipient.getId().equals(actor.getId()))) {
            return;
        }
        notificationRepository.save(Notification.builder()
                .recipient(recipient)
                .type(type)
                .scoreId(scoreId)
                .message(truncate(message))
                .params(toJson(params))
                .build());
    }

    @Override
    @Transactional
    public void notifyAdmins(
            Member actor, NotificationType type, String scoreId, String message, Map<String, String> params) {
        for (Member admin : memberRepository.findAllAdmins()) {
            notify(admin, actor, type, scoreId, message, params);
        }
    }

    @Override
    @Transactional
    public int notifyAll(java.util.Collection<Member> recipients, Member actor, NotificationType type, String message) {
        String text = truncate(message);
        java.util.List<Notification> batch = recipients.stream()
                .filter(r -> r != null && (actor == null || !r.getId().equals(actor.getId())))
                .map(r -> Notification.builder()
                        .recipient(r)
                        .type(type)
                        .message(text)
                        .build())
                .toList();
        notificationRepository.saveAll(batch);
        return batch.size();
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
                .params(fromJson(n.getParams()))
                .read(n.isRead())
                .createdAt(n.getCreatedAt())
                .build();
    }

    private String toJson(Map<String, String> params) {
        if (params == null || params.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(params);
        } catch (JsonProcessingException e) {
            return null; // thiếu params thì web dùng câu dự phòng trong message
        }
    }

    private Map<String, String> fromJson(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, String>>() {});
        } catch (JsonProcessingException e) {
            return null;
        }
    }

    private static String truncate(String s) {
        return s != null && s.length() > 500 ? s.substring(0, 500) : s;
    }
}
