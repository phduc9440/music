package com.ptit.music_be.service.score.impl;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import com.ptit.music_be.entity.Member;

/** N-05: trang chi tiết hiện tên chủ bản nhạc thay vì email. */
class ScoreOwnerNameTest {

    @Test
    void fullNameWinsThenEmailLocalPart() {
        assertThat(ScoreServiceImpl.displayNameOf(Member.builder()
                        .fullName(" An Võ ")
                        .email("an.vo@music.com")
                        .build()))
                .isEqualTo("An Võ");
        assertThat(ScoreServiceImpl.displayNameOf(
                        Member.builder().fullName(" ").email("an.vo@music.com").build()))
                .isEqualTo("an.vo");
        assertThat(ScoreServiceImpl.displayNameOf(null)).isNull();
    }
}
