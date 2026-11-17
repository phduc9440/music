package com.ptit.music_be.repository.notification;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.dto.enums.notification.NotificationType;
import com.ptit.music_be.entity.Notification;

@Repository
public interface NotificationRepository extends JpaRepository<Notification, String> {

    Page<Notification> findByRecipientEmailOrderByCreatedAtDesc(String email, Pageable pageable);

    /** Như trên nhưng bỏ các loại người dùng đã tắt hiển thị trong ứng dụng ({@code hidden} không được rỗng). */
    Page<Notification> findByRecipientEmailAndTypeNotInOrderByCreatedAtDesc(
            String email, Collection<NotificationType> hidden, Pageable pageable);

    long countByRecipientEmailAndReadFalse(String email);

    long countByRecipientEmailAndReadFalseAndTypeNotIn(String email, Collection<NotificationType> hidden);

    /** Chưa đọc từ {@code since}, thuộc các loại cho trước: nguồn của email tóm tắt hằng ngày. */
    List<Notification> findByRecipientIdAndReadFalseAndCreatedAtAfterAndTypeInOrderByCreatedAtDesc(
            String recipientId, LocalDateTime since, Collection<NotificationType> types);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Notification n set n.read = true where n.recipient.email = :email and n.read = false")
    int markAllRead(@Param("email") String email);
}
