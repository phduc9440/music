package com.ptit.music_be.utils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;

import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;

class MusicXmlInspectorTest {

    private static byte[] bytes(String xml) {
        return xml.getBytes(StandardCharsets.UTF_8);
    }

    /** Dựng MusicXML tối thiểu với khóa, nhịp và (tùy chọn) tempo ở ô nhịp đầu. */
    private static byte[] score(int fifths, String mode, String tempoAttr, int measures) {
        StringBuilder sb =
                new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?><score-partwise version=\"3.1\">");
        sb.append("<part-list><score-part id=\"P1\"><part-name>Piano</part-name></score-part></part-list>");
        sb.append("<part id=\"P1\">");
        for (int i = 1; i <= measures; i++) {
            sb.append("<measure number=\"").append(i).append("\">");
            if (i == 1) {
                sb.append("<attributes><divisions>4</divisions><key><fifths>")
                        .append(fifths)
                        .append("</fifths>")
                        .append(mode == null ? "" : "<mode>" + mode + "</mode>")
                        .append("</key><time><beats>3</beats><beat-type>4</beat-type></time>")
                        .append("<staves>2</staves></attributes>");
                if (tempoAttr != null) {
                    sb.append("<direction><sound tempo=\"").append(tempoAttr).append("\"/></direction>");
                }
            }
            sb.append("<note><rest/><duration>12</duration></note></measure>");
        }
        sb.append("</part></score-partwise>");
        return bytes(sb.toString());
    }

    @Test
    void validScoreIsSummarized() {
        MusicXmlSummary summary = MusicXmlInspector.inspect(score(0, "major", "96", 4));

        assertThat(summary.measureCount()).isEqualTo(4);
        assertThat(summary.keySignature()).isEqualTo("C");
        assertThat(summary.timeSignature()).isEqualTo("3/4");
        assertThat(summary.tempoBpm()).isEqualTo(96);
        assertThat(summary.staffCount()).isEqualTo(2);
    }

    @Test
    void keySignatureFormats() {
        assertThat(MusicXmlInspector.inspect(score(1, "major", null, 1)).keySignature())
                .isEqualTo("G");
        assertThat(MusicXmlInspector.inspect(score(-2, null, null, 1)).keySignature())
                .isEqualTo("Bb");
        assertThat(MusicXmlInspector.inspect(score(3, "minor", null, 1)).keySignature())
                .isEqualTo("F#m");
    }

    @Test
    void missingTempoDefaultsTo100() {
        assertThat(MusicXmlInspector.inspect(score(0, null, null, 1)).tempoBpm())
                .isEqualTo(100);
    }

    @Test
    void fractionalTempoIsRounded() {
        assertThat(MusicXmlInspector.inspect(score(0, null, "120.6", 1)).tempoBpm())
                .isEqualTo(121);
    }

    @Test
    void xxePayloadIsRejected() {
        byte[] xxe =
                bytes("<?xml version=\"1.0\"?><!DOCTYPE score-partwise [<!ENTITY x SYSTEM \"file:///etc/passwd\">]>"
                        + "<score-partwise><part id=\"P1\"><measure number=\"1\"><note><lyric>&x;</lyric></note>"
                        + "</measure></part></score-partwise>");

        assertThatThrownBy(() -> MusicXmlInspector.inspect(xxe))
                .isInstanceOfSatisfying(
                        AppException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.MUSICXML_INVALID));
    }

    @Test
    void anyDoctypeIsRejected() {
        byte[] withDoctype =
                bytes("<?xml version=\"1.0\"?><!DOCTYPE score-partwise PUBLIC \"-//Recordare//DTD MusicXML 3.1"
                        + " Partwise//EN\" \"http://www.musicxml.org/dtds/partwise.dtd\"><score-partwise><part id=\"P1\">"
                        + "<measure number=\"1\"/></part></score-partwise>");

        assertThatThrownBy(() -> MusicXmlInspector.inspect(withDoctype)).isInstanceOf(AppException.class);
    }

    @Test
    void wrongRootIsRejected() {
        byte[] wrongRoot = bytes("<score-timewise><measure number=\"1\"/></score-timewise>");

        assertThatThrownBy(() -> MusicXmlInspector.inspect(wrongRoot)).isInstanceOf(AppException.class);
    }

    @Test
    void scoreWithoutMeasureIsRejected() {
        byte[] noMeasure = bytes("<score-partwise><part id=\"P1\"></part></score-partwise>");

        assertThatThrownBy(() -> MusicXmlInspector.inspect(noMeasure)).isInstanceOf(AppException.class);
    }

    @Test
    void malformedXmlIsRejected() {
        assertThatThrownBy(() -> MusicXmlInspector.inspect(bytes("<score-partwise><part>")))
                .isInstanceOfSatisfying(
                        AppException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.MUSICXML_INVALID));
    }
}
