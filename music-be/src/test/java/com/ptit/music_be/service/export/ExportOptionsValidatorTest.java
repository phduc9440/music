package com.ptit.music_be.service.export;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.enums.AiTaskType;
import com.ptit.music_be.dto.enums.FileType;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;

class ExportOptionsValidatorTest {

    final ObjectMapper mapper = new ObjectMapper();
    final ExportOptionsValidator validator = new ExportOptionsValidator(mapper);

    Score score(int staffCount) {
        Score score = new Score();
        score.setStaffCount(staffCount);
        return score;
    }

    JsonNode json(String text) throws Exception {
        return mapper.readTree(text);
    }

    void assertInvalid(String format, String options, Score score) {
        assertThatThrownBy(() -> validator.validate(format, options == null ? null : json(options), score))
                .isInstanceOfSatisfying(AppException.class, e -> assertThat(e.getErrorCode())
                        .isEqualTo(ErrorCode.EXPORT_OPTION_INVALID));
    }

    private JsonNode json2(String text) {
        try {
            return mapper.readTree(text);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    void mp3_withoutOptions_getsDefaults() {
        ExportSpec spec = validator.validate("mp3", null, score(2));
        assertThat(spec.fileType()).isEqualTo(FileType.MP3);
        assertThat(spec.taskType()).isEqualTo(AiTaskType.AUDIO_SYNTHESIS);
        assertThat(spec.options())
                .isEqualTo(json2("{\"bitrate\":192,\"hands\":\"BOTH\",\"tempoPercent\":100,\"transpose\":0}"));
    }

    @Test
    void wav_hasNoBitrate() {
        ExportSpec spec = validator.validate("WAV", json2("{\"tempoPercent\":75,\"transpose\":-2}"), score(2));
        assertThat(spec.options().has("bitrate")).isFalse();
        assertThat(spec.intOption("tempoPercent", 100)).isEqualTo(75);
        assertThat(spec.intOption("transpose", 0)).isEqualTo(-2);
    }

    @Test
    void sameOptionsInDifferentOrder_areEqual() {
        ExportSpec a = validator.validate("MP3", json2("{\"transpose\":2,\"bitrate\":320}"), score(2));
        ExportSpec b = validator.validate("MP3", json2("{\"bitrate\":320,\"transpose\":2}"), score(2));
        assertThat(a.options()).isEqualTo(b.options());
    }

    @Test
    void rejectsBadValues() {
        Score score = score(2);
        assertInvalid("MP3", "{\"bitrate\":256}", score);
        assertInvalid("MP3", "{\"tempoPercent\":19}", score);
        assertInvalid("MP3", "{\"tempoPercent\":201}", score);
        assertInvalid("MP3", "{\"transpose\":13}", score);
        assertInvalid("MP3", "{\"transpose\":-13}", score);
        assertInvalid("MP3", "{\"transpose\":1.5}", score);
        assertInvalid("MP3", "{\"transpose\":\"2\"}", score);
        assertInvalid("MP3", "{\"hands\":\"BOTH2\"}", score);
        assertInvalid("MP3", "{\"hands\":1}", score);
        assertInvalid("MP3", "{\"unknown\":1}", score);
        assertInvalid("MP3", "[1,2]", score);
        assertInvalid("WAV", "{\"bitrate\":192}", score);
    }

    @Test
    void rejectsUnsupportedOrMissingFormat() {
        Score score = score(2);
        assertInvalid("PDF", null, score);
        assertInvalid("FLAC", null, score);
        assertInvalid("", null, score);
        assertInvalid(null, null, score);
    }

    @Test
    void singleHandOnlyForTwoStaffScores() {
        assertThat(validator
                        .validate("MP3", json2("{\"hands\":\"LEFT\"}"), score(2))
                        .textOption("hands", "BOTH"))
                .isEqualTo("LEFT");
        assertInvalid("MP3", "{\"hands\":\"RIGHT\"}", score(3));
        assertInvalid("MP3", "{\"hands\":\"LEFT\"}", score(1));
        // BOTH luôn hợp lệ
        assertThat(validator
                        .validate("MP3", json2("{\"hands\":\"BOTH\"}"), score(3))
                        .textOption("hands", "x"))
                .isEqualTo("BOTH");
    }
}
