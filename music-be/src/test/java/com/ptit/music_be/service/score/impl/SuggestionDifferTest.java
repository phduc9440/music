package com.ptit.music_be.service.score.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.w3c.dom.Document;
import org.w3c.dom.Element;

import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.utils.MeasureHasher;
import com.ptit.music_be.utils.MusicXmlInspector;

class SuggestionDifferTest {

    private static String base;
    private static String reserialized;

    @BeforeAll
    static void loadSamples() throws IOException {
        base = resource("base.musicxml");
        reserialized = resource("reserialized.musicxml");
    }

    private static String resource(String name) throws IOException {
        try (InputStream in = SuggestionDifferTest.class.getResourceAsStream("/measure-hash/" + name)) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static Document parse(String xml) {
        return MusicXmlInspector.parseStored(xml.getBytes(StandardCharsets.UTF_8));
    }

    private static SuggestionDiffer.Result diff(String proposed) {
        return SuggestionDiffer.diff(parse(base), parse(proposed));
    }

    /** Bản Editor serialize lại mà không sửa gì phải ra 0 thay đổi (rủi ro "ô đổi giả", plan I.3). */
    @Test
    void reserializedFileHasNoChanges() {
        SuggestionDiffer.Result result = diff(reserialized);

        assertThat(result.structural()).isFalse();
        assertThat(result.changes()).isEmpty();
    }

    /** SUG-1: sửa 3 ô thì ra đúng 3 thay đổi, không structural. */
    @Test
    void editedMeasuresAreListed() {
        String proposed = base.replace("<step>C</step><octave>4</octave>", "<step>C</step><octave>5</octave>")
                .replace("<step>D</step>", "<step>F</step>")
                .replace("<step>G</step>", "<step>A</step>");

        SuggestionDiffer.Result result = diff(proposed);

        assertThat(result.structural()).isFalse();
        assertThat(result.changes())
                .extracting(SuggestionDiffer.MeasureChange::measureIndex)
                .containsExactly(0, 1, 2);
        assertThat(result.changes())
                .extracting(SuggestionDiffer.MeasureChange::measureNumber)
                .containsExactly("1", "2", "3");
        assertThat(result.changes()).allSatisfy(change -> {
            assertThat(change.partIndex()).isZero();
            assertThat(change.contextHash()).matches("[0-9a-f]{64}");
        });
    }

    @Test
    void changeCarriesBaseHashAndProposedMeasure() {
        SuggestionDiffer.Result result = diff(base.replace("<step>D</step>", "<step>F</step>"));

        assertThat(result.changes()).hasSize(1);
        SuggestionDiffer.MeasureChange change = result.changes().get(0);
        Element baseMeasure = SuggestionDiffer.measuresOf(parse(base)).get(0).get(1);
        assertThat(change.baseHash()).isEqualTo(MeasureHasher.hash(baseMeasure));

        Element proposedMeasure = parse(change.proposedXml()).getDocumentElement();
        assertThat(proposedMeasure.getTagName()).isEqualTo("measure");
        assertThat(proposedMeasure.getAttribute("number")).isEqualTo("2");
        assertThat(change.proposedXml()).contains("<step>F</step>").doesNotContain("<?xml");
    }

    /** Hợp âm là nội dung của ô nên đổi hợp âm cũng là một thay đổi. */
    @Test
    void harmonyChangeIsDetected() {
        SuggestionDiffer.Result result = diff(base.replace("<kind>major</kind>", "<kind>minor</kind>"));

        assertThat(result.changes())
                .extracting(SuggestionDiffer.MeasureChange::measureIndex)
                .containsExactly(0);
    }

    /** SUG-4: đổi số chỉ nhịp ở ô 1 làm các ô sau đọc khác đi, nên là structural. */
    @Test
    void timeSignatureChangeIsStructural() {
        SuggestionDiffer.Result result = diff(base.replace("<beats>4</beats>", "<beats>3</beats>"));

        assertThat(result.structural()).isTrue();
        assertThat(result.changes()).isEmpty();
        assertThat(result.baseShape()).isEqualTo(new SuggestionDiffer.Shape(List.of("P1"), List.of(3)));
    }

    /** SUG-12: đổi divisions (ô 1) cùng lúc sửa ô khác vẫn là structural. */
    @Test
    void divisionsChangeIsStructural() {
        String proposed = base.replace("<divisions>4</divisions>", "<divisions>8</divisions>")
                .replace("<step>G</step>", "<step>A</step>");

        assertThat(diff(proposed).structural()).isTrue();
    }

    @Test
    void keyChangeIsStructural() {
        assertThat(diff(base.replace("<fifths>0</fifths>", "<fifths>2</fifths>"))
                        .structural())
                .isTrue();
    }

    @Test
    void addedMeasureIsStructural() {
        String proposed = base.replace(
                "</part>",
                "<measure number=\"4\"><note><rest measure=\"yes\"/><duration>16</duration></note></measure></part>");

        assertThat(diff(proposed).structural()).isTrue();
    }

    @Test
    void partListChangeIsStructural() {
        assertThat(diff(base.replace("<part-name>Piano</part-name>", "<part-name>Organ</part-name>"))
                        .structural())
                .isTrue();
    }

    @Test
    void titleChangeIsStructural() {
        assertThat(diff(base.replace("Bài thử", "Bài khác")).structural()).isTrue();
    }

    /** Thông tin tác giả, cấu hình hiển thị chỉ là trình bày, không tính. */
    @Test
    void identificationAndDefaultsAreIgnored() {
        SuggestionDiffer.Result result =
                diff(base.replace("Tác giả", "Người khác").replace("<tenths>40", "<tenths>50"));

        assertThat(result.structural()).isFalse();
        assertThat(result.changes()).isEmpty();
    }

    @Test
    void shapeListsPartsAndMeasureCounts() {
        assertThat(SuggestionDiffer.shapeOf(parse(base)))
                .isEqualTo(new SuggestionDiffer.Shape(List.of("P1"), List.of(3)));
    }

    /** Mã ngữ cảnh: ô 1 chưa có gì, ô 2 và 3 giống nhau (không ô nào đổi attributes sau ô 1). */
    @Test
    void contextHashTracksAttributesFromPreviousMeasures() {
        List<String> hashes = SuggestionDiffer.contextHashes(SuggestionDiffer.measuresOf(parse(base)))
                .get(0);

        assertThat(hashes).hasSize(3);
        assertThat(hashes.get(1)).isNotEqualTo(hashes.get(0)).isEqualTo(hashes.get(2));
    }

    @Test
    void nonPartwiseRootIsRejected() {
        Document timewise = parse("<score-timewise version=\"4.0\"></score-timewise>");

        assertThatThrownBy(() -> SuggestionDiffer.shapeOf(timewise))
                .isInstanceOfSatisfying(
                        AppException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.MUSICXML_INVALID));
    }
}
