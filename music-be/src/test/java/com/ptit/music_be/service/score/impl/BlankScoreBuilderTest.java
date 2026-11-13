package com.ptit.music_be.service.score.impl;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.w3c.dom.Document;
import org.w3c.dom.Element;

import com.ptit.music_be.dto.enums.score.BlankPreset;
import com.ptit.music_be.dto.enums.score.KeyMode;
import com.ptit.music_be.dto.request.score.BlankScoreRequest;
import com.ptit.music_be.utils.MusicXmlInspector;
import com.ptit.music_be.utils.MusicXmlSummary;

/** CR-1 và CR-2: bản nhạc trống dựng ra parse lại được, đúng số ô, số khuông và trường độ từng ô. */
class BlankScoreBuilderTest {

    private static BlankScoreRequest request(BlankPreset preset, int fifths, KeyMode mode, int beats, int beatType) {
        return BlankScoreRequest.builder()
                .title("Bài thử")
                .composer("Người soạn")
                .preset(preset)
                .keyFifths(fifths)
                .mode(mode)
                .beats(beats)
                .beatType(beatType)
                .tempoBpm(96)
                .measures(16)
                .build();
    }

    private static int expectedStaves(BlankPreset preset) {
        return switch (preset) {
            case PIANO -> 2;
            case VOICE_PIANO -> 3;
            case GUITAR -> 1;
            case SATB -> 4;
        };
    }

    private static int expectedParts(BlankPreset preset) {
        return switch (preset) {
            case PIANO, GUITAR -> 1;
            case VOICE_PIANO -> 2;
            case SATB -> 4;
        };
    }

    @Test
    void pianoInGMajorThreeFourMatchesTheSummary() {
        byte[] xml = BlankScoreBuilder.build(request(BlankPreset.PIANO, 1, KeyMode.MAJOR, 3, 4));

        MusicXmlSummary summary = MusicXmlInspector.inspect(xml);

        assertThat(summary.measureCount()).isEqualTo(16);
        assertThat(summary.keySignature()).isEqualTo("G");
        assertThat(summary.timeSignature()).isEqualTo("3/4");
        assertThat(summary.tempoBpm()).isEqualTo(96);
        assertThat(summary.staffCount()).isEqualTo(2);
    }

    @Test
    void minorKeyIsNamedAsMinor() {
        byte[] xml = BlankScoreBuilder.build(request(BlankPreset.GUITAR, -1, KeyMode.MINOR, 4, 4));

        assertThat(MusicXmlInspector.inspect(xml).keySignature()).isEqualTo("Dm");
    }

    @Test
    void titleAndComposerAreWritten() {
        Document document = MusicXmlInspector.parseSecure(
                BlankScoreBuilder.build(request(BlankPreset.PIANO, 0, KeyMode.MAJOR, 4, 4)));

        assertThat(document.getElementsByTagName("work-title").item(0).getTextContent())
                .isEqualTo("Bài thử");
        assertThat(document.getElementsByTagName("creator").item(0).getTextContent())
                .isEqualTo("Người soạn");
    }

    @ParameterizedTest
    @EnumSource(BlankPreset.class)
    void everyPresetParsesBackWithFullRestMeasuresOfTheRightLength(BlankPreset preset) {
        byte[] xml = BlankScoreBuilder.build(request(preset, 2, KeyMode.MAJOR, 6, 8));

        MusicXmlSummary summary = MusicXmlInspector.inspect(xml);
        Document document = MusicXmlInspector.parseSecure(xml);
        List<Element> parts = MusicXmlInspector.childElements(document.getDocumentElement(), "part");

        assertThat(summary.staffCount()).isEqualTo(expectedStaves(preset));
        assertThat(parts).hasSize(expectedParts(preset));
        int expectedDuration = BlankScoreBuilder.measureDuration(6, 8);
        for (Element part : parts) {
            List<Element> measures = MusicXmlInspector.childElements(part, "measure");
            assertThat(measures).hasSize(16);
            for (Element measure : measures) {
                assertThat(durationPerStaff(measure).values()).allMatch(total -> total == expectedDuration);
            }
        }
    }

    @Test
    void measureDurationFollowsTheTimeSignature() {
        assertThat(BlankScoreBuilder.measureDuration(4, 4)).isEqualTo(16);
        assertThat(BlankScoreBuilder.measureDuration(3, 4)).isEqualTo(12);
        assertThat(BlankScoreBuilder.measureDuration(6, 8)).isEqualTo(12);
        assertThat(BlankScoreBuilder.measureDuration(2, 2)).isEqualTo(16);
        assertThat(BlankScoreBuilder.measureDuration(12, 16)).isEqualTo(12);
    }

    /** Tổng trường độ các nốt/dấu lặng của từng khuông trong một ô (staff mặc định 1). */
    private static Map<String, Integer> durationPerStaff(Element measure) {
        Map<String, Integer> totals = new HashMap<>();
        for (Element note : MusicXmlInspector.childElements(measure, "note")) {
            List<Element> staff = MusicXmlInspector.childElements(note, "staff");
            String key = staff.isEmpty() ? "1" : staff.get(0).getTextContent();
            int duration = Integer.parseInt(
                    MusicXmlInspector.childElements(note, "duration").get(0).getTextContent());
            totals.merge(key, duration, Integer::sum);
        }
        return totals;
    }
}
