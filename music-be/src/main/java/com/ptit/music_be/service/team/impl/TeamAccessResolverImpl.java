package com.ptit.music_be.service.team.impl;

import java.util.Optional;

import org.springframework.stereotype.Component;

import com.ptit.music_be.dto.enums.score.ScoreAccess;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.repository.team.ShowItemRepository;
import com.ptit.music_be.repository.team.TeamMemberRepository;
import com.ptit.music_be.service.permission.TeamAccessResolver;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

/**
 * Quyền qua team (mục 4.1, ma trận 2.3): OWNER/MANAGER là chủ mọi bản của team; ARRANGER sửa được bài mình được giao phối
 * trong một show của team, các bài khác chỉ nhận xét; VIEWER chỉ xem. ScorePermissionService lấy mức cao hơn giữa mức này
 * và chia sẻ cá nhân.
 */
@Component
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class TeamAccessResolverImpl implements TeamAccessResolver {

    TeamMemberRepository teamMemberRepository;
    ShowItemRepository showItemRepository;

    @Override
    public Optional<ScoreAccess> resolve(Score score, String memberId) {
        String teamId = score.getTeamId();
        if (teamId == null) {
            return Optional.empty();
        }
        return teamMemberRepository.findByTeamIdAndMemberId(teamId, memberId).map(tm -> switch (tm.getRole()) {
            case OWNER, MANAGER -> ScoreAccess.OWNER;
            case ARRANGER ->
                showItemRepository.isArrangerOf(score.getId(), memberId, teamId)
                        ? ScoreAccess.EDIT
                        : ScoreAccess.REVIEW;
            case VIEWER -> ScoreAccess.VIEW;
        });
    }
}
