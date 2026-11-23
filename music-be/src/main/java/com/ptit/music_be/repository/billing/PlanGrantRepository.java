package com.ptit.music_be.repository.billing;

import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.entity.PlanGrant;

@Repository
public interface PlanGrantRepository extends JpaRepository<PlanGrant, String> {

    /** Lịch sử được cấp gói của một người, mới nhất trước (trang Gói của tôi). */
    List<PlanGrant> findByMemberEmailOrderByCreatedAtDesc(String email);

    /** Lịch sử cấp gói ở khu quản trị; memberId null thì lấy của mọi người. */
    @Query("select g from PlanGrant g where (:memberId is null or g.member.id = :memberId)")
    Page<PlanGrant> search(@Param("memberId") String memberId, Pageable pageable);

    boolean existsByPlanId(String planId);
}
