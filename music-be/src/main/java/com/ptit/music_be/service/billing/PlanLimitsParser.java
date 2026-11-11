package com.ptit.music_be.service.billing;

import org.springframework.stereotype.Component;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.entity.Plan;

import lombok.RequiredArgsConstructor;

/** Đọc cột JSON {@code plans.limits} thành {@link PlanLimits}. */
@Component
@RequiredArgsConstructor
public class PlanLimitsParser {

    private final ObjectMapper objectMapper;

    public PlanLimits parse(Plan plan) {
        try {
            return objectMapper.readValue(plan.getLimits(), PlanLimits.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Hạn mức của gói " + plan.getCode() + " không đọc được", e);
        }
    }
}
