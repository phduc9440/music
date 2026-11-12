package com.ptit.music_be.service.team;

import java.util.Collections;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.enums.TeamActivityType;
import com.ptit.music_be.dto.enums.TeamMemberKind;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.TeamMember;
import com.ptit.music_be.repository.TeamMemberRepository;
import com.ptit.music_be.repository.TeamRepository;
import com.ptit.music_be.service.notification.NotificationService;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;

/**
 * Ghi nhật ký hoạt động của team (tab Hoạt động) thành dòng kind = ACTIVITY trong team_members, chạy chung transaction với
 * thao tác gốc.
 */
@Slf4j
@Component
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class TeamActivityLog {

    static final TypeReference<Map<String, String>> MAP = new TypeReference<>() {};

    TeamMemberRepository repository;
    TeamRepository teamRepository;
    ObjectMapper objectMapper;

    /** keyValues: các cặp khóa, giá trị (score, name, role, show, status...); cặp có giá trị null bị bỏ. */
    public void log(String teamId, Member actor, TeamActivityType type, String... keyValues) {
        Map<String, String> params = NotificationService.params(keyValues);
        String json = null;
        if (!params.isEmpty()) {
            try {
                json = objectMapper.writeValueAsString(params);
            } catch (JsonProcessingException e) {
                log.warn("Không ghi được params hoạt động team {}", type, e);
            }
        }
        repository.save(TeamMember.builder()
                .kind(TeamMemberKind.ACTIVITY)
                // Chỉ cần khóa ngoại team_id, không nạp team
                .team(teamRepository.getReferenceById(teamId))
                .member(actor)
                .type(type)
                .params(json)
                .build());
    }

    public Map<String, String> paramsOf(TeamMember activity) {
        if (activity.getParams() == null) {
            return Collections.emptyMap();
        }
        try {
            return objectMapper.readValue(activity.getParams(), MAP);
        } catch (JsonProcessingException e) {
            return Collections.emptyMap();
        }
    }
}
