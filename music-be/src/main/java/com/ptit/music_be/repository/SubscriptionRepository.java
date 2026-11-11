package com.ptit.music_be.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.dto.enums.SubscriptionStatus;
import com.ptit.music_be.entity.Subscription;

@Repository
public interface SubscriptionRepository extends JpaRepository<Subscription, String> {

    /** Gói đang hiệu lực của thành viên (ACTIVE và chưa hết hạn), mới nhất trước. */
    @Query("select s from Subscription s where s.member.id = :memberId and s.status = 'ACTIVE' and s.expiresAt > :now"
            + " order by s.expiresAt desc")
    List<Subscription> findCurrent(@Param("memberId") String memberId, @Param("now") LocalDateTime now);

    default Optional<Subscription> findCurrentOne(String memberId, LocalDateTime now) {
        return findCurrent(memberId, now).stream().findFirst();
    }

    /** Gói đang hiệu lực sẽ hết hạn trong khoảng (from, to]. */
    List<Subscription> findByStatusAndExpiresAtGreaterThanAndExpiresAtLessThanEqual(
            SubscriptionStatus status, LocalDateTime from, LocalDateTime to);

    List<Subscription> findByStatusAndExpiresAtBefore(SubscriptionStatus status, LocalDateTime time);
}
