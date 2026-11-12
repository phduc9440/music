package com.ptit.music_be.service.notification;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.ptit.music_be.dto.enums.notification.NotificationType;
import com.ptit.music_be.event.ScoreTrashedByAdminEvent;
import com.ptit.music_be.repository.auth.MemberRepository;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;

/** Báo cho chủ biết khi ADMIN chuyển bản nhạc của họ vào thùng rác. Chạy sau commit nên xóa lỗi thì không có thông báo. */
@Component
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Slf4j
public class ScoreTrashedNotificationListener {

    MemberRepository memberRepository;
    NotificationService notificationService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onTrashedByAdmin(ScoreTrashedByAdminEvent event) {
        try {
            memberRepository
                    .findById(event.ownerId())
                    .ifPresent(owner -> notificationService.notify(
                            owner,
                            null,
                            NotificationType.SCORE_TRASHED_BY_ADMIN,
                            event.scoreId(),
                            message(event),
                            NotificationService.params("title", event.scoreTitle(), "reason", event.reason())));
        } catch (RuntimeException e) {
            // Thông báo là phần phụ: không để lỗi ở đây làm hỏng thao tác đã commit
            log.warn("Không gửi được thông báo xóa bản nhạc {}: {}", event.scoreId(), e.getMessage());
        }
    }

    static String message(ScoreTrashedByAdminEvent event) {
        String base = "Bản nhạc \"" + event.scoreTitle() + "\" đã bị quản trị viên chuyển vào thùng rác"
                + " (khôi phục được trong 30 ngày)";
        return event.reason() == null ? base : base + ": " + event.reason();
    }
}
