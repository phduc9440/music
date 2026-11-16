package com.ptit.music_be.repository.notification;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.dto.enums.notification.NotificationCategory;
import com.ptit.music_be.entity.NotificationPreference;

@Repository
public interface NotificationPreferenceRepository extends JpaRepository<NotificationPreference, String> {

    List<NotificationPreference> findByMemberId(String memberId);

    Optional<NotificationPreference> findByMemberIdAndCategory(String memberId, NotificationCategory category);

    /** Mọi lựa chọn bật email, kèm người dùng, để dựng email tóm tắt hằng ngày. */
    @Query("select p from NotificationPreference p join fetch p.member where p.email = true")
    List<NotificationPreference> findAllWithEmailOn();
}
