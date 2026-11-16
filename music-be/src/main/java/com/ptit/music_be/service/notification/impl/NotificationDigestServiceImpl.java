package com.ptit.music_be.service.notification.impl;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.notification.NotificationCategory;
import com.ptit.music_be.dto.enums.notification.NotificationType;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Notification;
import com.ptit.music_be.entity.NotificationPreference;
import com.ptit.music_be.repository.notification.NotificationPreferenceRepository;
import com.ptit.music_be.repository.notification.NotificationRepository;
import com.ptit.music_be.service.auth.EmailService;
import com.ptit.music_be.service.notification.NotificationDigestService;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
public class NotificationDigestServiceImpl implements NotificationDigestService {

    static final int WINDOW_HOURS = 24;

    private final NotificationPreferenceRepository preferenceRepository;
    private final NotificationRepository notificationRepository;
    private final EmailService emailService;
    private final String webUrl;

    public NotificationDigestServiceImpl(
            NotificationPreferenceRepository preferenceRepository,
            NotificationRepository notificationRepository,
            EmailService emailService,
            @Value("${app.web-url:http://localhost:5173}") String webUrl) {
        this.preferenceRepository = preferenceRepository;
        this.notificationRepository = notificationRepository;
        this.emailService = emailService;
        this.webUrl = webUrl.endsWith("/") ? webUrl.substring(0, webUrl.length() - 1) : webUrl;
    }

    @Override
    @Transactional(readOnly = true)
    public int sendDaily() {
        // Gom các nhóm bật email theo người (một người có thể bật nhiều nhóm).
        Map<String, Member> members = new LinkedHashMap<>();
        Map<String, Set<NotificationCategory>> categories = new LinkedHashMap<>();
        for (NotificationPreference p : preferenceRepository.findAllWithEmailOn()) {
            members.put(p.getMember().getId(), p.getMember());
            categories
                    .computeIfAbsent(p.getMember().getId(), k -> EnumSet.noneOf(NotificationCategory.class))
                    .add(p.getCategory());
        }

        LocalDateTime since = LocalDateTime.now().minusHours(WINDOW_HOURS);
        int sent = 0;
        for (Map.Entry<String, Member> entry : members.entrySet()) {
            Member member = entry.getValue();
            if (member.getEmail() == null || member.getEmail().isBlank()) {
                continue;
            }
            List<NotificationType> types = categories.get(entry.getKey()).stream()
                    .map(NotificationCategory::types)
                    .flatMap(Collection::stream)
                    .toList();
            List<Notification> unread = notificationRepository
                    .findByRecipientIdAndReadFalseAndCreatedAtAfterAndTypeInOrderByCreatedAtDesc(
                            member.getId(), since, types);
            if (unread.isEmpty()) {
                continue; // không có gì mới thì không gửi
            }
            emailService.sendNotificationDigestEmail(
                    member.getEmail(), member.getLocale(), countByCategory(unread), webUrl + "/");
            sent++;
        }
        if (sent > 0) {
            log.info("Đã gửi {} email tóm tắt thông báo", sent);
        }
        return sent;
    }

    private static Map<NotificationCategory, Long> countByCategory(List<Notification> notifications) {
        Map<NotificationCategory, Long> counts = new EnumMap<>(NotificationCategory.class);
        for (Notification n : notifications) {
            counts.merge(NotificationCategory.of(n.getType()), 1L, Long::sum);
        }
        return counts;
    }
}
