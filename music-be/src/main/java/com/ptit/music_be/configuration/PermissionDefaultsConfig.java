package com.ptit.music_be.configuration;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.ptit.music_be.service.permission.ScoreAccessAuditor;

import lombok.extern.slf4j.Slf4j;

/**
 * Bản mặc định cho chỗ cắm nhật ký kiểm duyệt của {@code ScorePermissionService}: ai viết bản cài thật chỉ cần khai báo
 * một bean cùng kiểu, bản mặc định tự nhường chỗ. Chỗ cắm Team đã có bản cài thật ({@code TeamAccessResolverImpl}).
 */
@Slf4j
@Configuration
public class PermissionDefaultsConfig {

    @Bean
    @ConditionalOnMissingBean(ScoreAccessAuditor.class)
    ScoreAccessAuditor defaultScoreAccessAuditor() {
        return (score, memberEmail, action) ->
                log.info("Kiểm duyệt: {} thực hiện {} trên bản nhạc {}", memberEmail, action, score.getId());
    }
}
