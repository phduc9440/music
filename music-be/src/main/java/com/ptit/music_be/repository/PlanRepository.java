package com.ptit.music_be.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.entity.Plan;

@Repository
public interface PlanRepository extends JpaRepository<Plan, String> {

    Optional<Plan> findByCode(String code);

    List<Plan> findAllByOrderBySortOrderAsc();
}
