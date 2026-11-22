package com.ptit.music_be.service.score.impl;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.OptionalLong;

import org.junit.jupiter.api.Test;

/** Đọc mốc seq của phiên cùng sửa trong meta MusicXML (COL-T01). */
class ScoreContentLiveSeqTest {

    @Test
    void readsSeqToOfALiveSnapshot() {
        assertThat(ScoreContentServiceImpl.liveSeqOf("{\"source\":\"LIVE\",\"seqFrom\":3,\"seqTo\":17}"))
                .isEqualTo(OptionalLong.of(17));
    }

    @Test
    void ignoresOtherSourcesMissingSeqAndBrokenJson() {
        assertThat(ScoreContentServiceImpl.liveSeqOf("{\"source\":\"EDITOR\",\"seqTo\":17}"))
                .isEmpty();
        assertThat(ScoreContentServiceImpl.liveSeqOf("{\"source\":\"LIVE\"}")).isEmpty();
        assertThat(ScoreContentServiceImpl.liveSeqOf("{not json")).isEmpty();
        assertThat(ScoreContentServiceImpl.liveSeqOf(null)).isEmpty();
    }
}
