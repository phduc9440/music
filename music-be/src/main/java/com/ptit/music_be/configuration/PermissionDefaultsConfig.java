package com.ptit.music_be.configuration;

import java.util.Optional;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.ptit.music_be.service.permission.ScoreAccessAuditor;
import com.ptit.music_be.service.permission.TeamAccessResolver;

import lombok.extern.slf4j.Slf4j;

/**
 * Bản mặc định cho hai chỗ cắm của {@code ScorePermissionService}. Ai viết bản cài thật (Team, nhật ký kiểm duyệt)
 * chỉ cần khai báo một bean cùng kiểu, bản mặc định tự nhường chỗ.
 */
@Slf4j
@Configuration
public class PermissionDefaultsConfig {

    @Bean
    @ConditionalOnMissingBean(TeamAccessResolver.class)
    TeamAccessResolver defaultTeamAccessResolver() {
        return (score, memberId) -> Optional.empty();
    }

    @Bean
    @ConditionalOnMissingBean(ScoreAccessAuditor.class)
    ScoreAccessAuditor defaultScoreAccessAuditor() {
        return (score, memberEmail, action) ->
                log.info("Kiểm duyệt: {} thực hiện {} trên bản nhạc {}", memberEmail, action, score.getId());
    }
}
