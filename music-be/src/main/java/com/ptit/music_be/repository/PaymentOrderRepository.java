package com.ptit.music_be.repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.dto.enums.PaymentStatus;
import com.ptit.music_be.entity.PaymentOrder;

@Repository
public interface PaymentOrderRepository extends JpaRepository<PaymentOrder, String> {

    Optional<PaymentOrder> findByOrderCode(String orderCode);

    /** Khóa dòng khi xử lý IPN để hai thông báo đến cùng lúc không cùng kích hoạt gói. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from PaymentOrder o where o.orderCode = :code")
    Optional<PaymentOrder> findByOrderCodeForUpdate(@Param("code") String code);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from PaymentOrder o where o.id = :id")
    Optional<PaymentOrder> findByIdForUpdate(@Param("id") String id);

    List<PaymentOrder> findByMemberEmailOrderByCreatedAtDesc(String email);

    Page<PaymentOrder> findByStatus(PaymentStatus status, Pageable pageable);

    List<PaymentOrder> findByStatusAndExpiresAtBefore(PaymentStatus status, LocalDateTime time);

    @Query("select o from PaymentOrder o where o.status in :statuses and o.paidAt >= :from and o.paidAt < :to")
    List<PaymentOrder> findPaidBetween(
            @Param("statuses") Collection<PaymentStatus> statuses,
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);
}
