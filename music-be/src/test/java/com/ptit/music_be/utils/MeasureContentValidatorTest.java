package com.ptit.music_be.utils;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.w3c.dom.Element;

class MeasureContentValidatorTest {

    private static Element measure(String body) {
        String xml = "<score-partwise><part id=\"P1\"><measure number=\"1\">" + body + "</measure></part></score-partwise>";
        return (Element) MusicXmlInspector.parseSecure(xml.getBytes(StandardCharsets.UTF_8))
                .getElementsByTagName("measure")
                .item(0);
    }

    private static String note(String step, String octave, String duration, String type) {
        return "<note><pitch><step>" + step + "</step><octave>" + octave + "</octave></pitch><duration>" + duration
                + "</duration><type>" + type + "</type></note>";
    }

    @Test
    void acceptsNormalNotesRestsAndGraceNotes() {
        assertThat(MeasureContentValidator.isValidMeasure(measure(note("C", "4", "4", "quarter")
                        + "<note><rest/><duration>4</duration><type>quarter</type></note>"
                        + "<note><grace/><pitch><step>D</step><alter>1</alter><octave>5</octave></pitch><type>eighth</type></note>"
                        + "<backup><duration>8</duration></backup>")))
                .isTrue();
    }

    @Test
    void rejectsImpossibleMusic() {
        // nội dung thật đã lọt vào phiên bản 4 khi chạy thử cùng sửa (C-02)
        assertThat(MeasureContentValidator.isValidMeasure(measure(note("H", "99", "-5", "banana"))))
                .isFalse();
        assertThat(MeasureContentValidator.isValidMeasure(measure(note("H", "4", "4", "quarter"))))
                .isFalse();
        assertThat(MeasureContentValidator.isValidMeasure(measure(note("C", "10", "4", "quarter"))))
                .isFalse();
        assertThat(MeasureContentValidator.isValidMeasure(measure(note("C", "4", "-1", "quarter"))))
                .isFalse();
        assertThat(MeasureContentValidator.isValidMeasure(measure(note("C", "4", "4", "banana"))))
                .isFalse();
        assertThat(MeasureContentValidator.isValidMeasure(measure("<note><pitch><step>C</step><alter>3</alter>"
                        + "<octave>4</octave></pitch><duration>4</duration></note>")))
                .isFalse();
    }
}
