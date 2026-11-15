package com.ptit.music_be.service.export;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.enums.ai.AiTaskType;
import com.ptit.music_be.dto.enums.score.FileType;
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

    @Test
    void midiAndMusicXmlTakeNoOptions() {
        assertThat(validator.validate("MIDI", null, score(2)).fileType()).isEqualTo(FileType.MIDI);
        assertThat(validator.validate("musicxml", json2("{}"), score(2)).fileType())
                .isEqualTo(FileType.MUSICXML);
        assertInvalid("MIDI", "{\"transpose\":2}", score(2));
        assertInvalid("MUSICXML", "{\"bitrate\":192}", score(2));
    }

    @Test
    void svgPageIsAllOrPositiveNumber() {
        ExportSpec all = validator.validate("SVG", null, score(2));
        assertThat(all.fileType()).isEqualTo(FileType.SVG);
        assertThat(all.taskType()).isEqualTo(AiTaskType.FORMAT_CONVERSION);
        assertThat(all.page()).isNull();
        assertThat(all.options().isEmpty()).isTrue();

        assertThat(validator
                        .validate("SVG", json2("{\"page\":\"ALL\"}"), score(2))
                        .page())
                .isNull();
        // Trang không nằm trong khóa cache nên các lựa chọn trang cho cùng một bộ tùy chọn
        ExportSpec third = validator.validate("SVG", json2("{\"page\":3}"), score(2));
        assertThat(third.page()).isEqualTo(3);
        assertThat(third.options()).isEqualTo(all.options());

        assertInvalid("SVG", "{\"page\":0}", score(2));
        assertInvalid("SVG", "{\"page\":-1}", score(2));
        assertInvalid("SVG", "{\"page\":1.5}", score(2));
        assertInvalid("SVG", "{\"page\":\"first\"}", score(2));
        assertInvalid("SVG", "{\"dpi\":300}", score(2));
    }

    @Test
    void pdfWithoutOptionsGetsDefaults() {
        ExportSpec spec = validator.validate("pdf", null, score(2));

        assertThat(spec.fileType()).isEqualTo(FileType.PDF);
        assertThat(spec.taskType()).isEqualTo(AiTaskType.FORMAT_CONVERSION);
        assertThat(spec.options())
                .isEqualTo(json2("{\"pageSize\":\"A4\",\"orientation\":\"PORTRAIT\",\"staffSpaceMm\":1.75,"
                        + "\"marginMm\":15,\"showTitle\":true,\"measureNumbers\":\"SYSTEM\",\"showChords\":true}"));
    }

    @Test
    void pdfOptionsAreNormalized() {
        ExportSpec a = validator.validate(
                "PDF", json2("{\"staffSpaceMm\":2,\"pageSize\":\"LETTER\",\"showChords\":false}"), score(2));
        ExportSpec b = validator.validate(
                "PDF", json2("{\"showChords\":false,\"pageSize\":\"LETTER\",\"staffSpaceMm\":2.001}"), score(2));

        assertThat(a.options().get("staffSpaceMm").asDouble()).isEqualTo(2.0);
        // 2 và 2.001 cùng làm tròn về 2.0 nên cùng khóa cache
        assertThat(a.options()).isEqualTo(b.options());
        assertThat(a.options().get("showChords").asBoolean()).isFalse();
    }

    @Test
    void pdfRejectsBadValues() {
        Score score = score(2);
        assertInvalid("PDF", "{\"pageSize\":\"A3\"}", score);
        assertInvalid("PDF", "{\"orientation\":\"SIDEWAYS\"}", score);
        assertInvalid("PDF", "{\"staffSpaceMm\":1.49}", score);
        assertInvalid("PDF", "{\"staffSpaceMm\":2.21}", score);
        assertInvalid("PDF", "{\"staffSpaceMm\":\"1.75\"}", score);
        assertInvalid("PDF", "{\"marginMm\":9}", score);
        assertInvalid("PDF", "{\"marginMm\":26}", score);
        assertInvalid("PDF", "{\"marginMm\":12.5}", score);
        assertInvalid("PDF", "{\"showTitle\":\"yes\"}", score);
        assertInvalid("PDF", "{\"measureNumbers\":\"ALL\"}", score);
        assertInvalid("PDF", "{\"showChords\":1}", score);
        assertInvalid("PDF", "{\"tempoPercent\":50}", score);
        // Các mốc biên hợp lệ
        validator.validate("PDF", json2("{\"staffSpaceMm\":1.5,\"marginMm\":10}"), score);
        validator.validate("PDF", json2("{\"staffSpaceMm\":2.2,\"marginMm\":25}"), score);
    }
}
