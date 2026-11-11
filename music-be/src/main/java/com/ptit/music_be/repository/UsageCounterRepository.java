package com.ptit.music_be.repository;

import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.dto.enums.UsageMetric;
import com.ptit.music_be.entity.UsageCounter;

@Repository
public interface UsageCounterRepository extends JpaRepository<UsageCounter, String> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from UsageCounter u where u.memberId = :memberId and u.metric = :metric and u.period = :period")
    Optional<UsageCounter> findForUpdate(
            @Param("memberId") String memberId, @Param("metric") UsageMetric metric, @Param("period") String period);

    Optional<UsageCounter> findByMemberIdAndMetricAndPeriod(String memberId, UsageMetric metric, String period);
}
