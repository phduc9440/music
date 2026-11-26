package com.ptit.music_be.service.ai;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class AiTaskNotifierTest {

    @Test
    void readsSuggestionIdFromChordResultData() {
        assertThat(AiTaskNotifier.suggestionIdOf("{\"suggestionId\": \"abc-123\", \"chordCount\": 12}"))
                .isEqualTo("abc-123");
    }

    @Test
    void missingSuggestionIdIsNull() {
        assertThat(AiTaskNotifier.suggestionIdOf(null)).isNull();
        assertThat(AiTaskNotifier.suggestionIdOf("{\"chordCount\": 12}")).isNull();
    }
}
