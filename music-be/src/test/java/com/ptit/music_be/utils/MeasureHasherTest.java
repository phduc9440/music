package com.ptit.music_be.utils;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.w3c.dom.Document;
import org.w3c.dom.Element;

class MeasureHasherTest {

    private static String resource(String name) throws IOException {
        try (InputStream in = MeasureHasherTest.class.getResourceAsStream("/measure-hash/" + name)) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static List<Element> measures(String xml) {
        Document document = MusicXmlInspector.parseStored(xml.getBytes(StandardCharsets.UTF_8));
        Element part = MusicXmlInspector.childElements(document.getDocumentElement(), "part")
                .get(0);
        return MusicXmlInspector.childElements(part, "measure");
    }

    private static Element wrap(String measureXml) {
        return measures("<score-partwise><part id=\"P1\">" + measureXml + "</part></score-partwise>")
                .get(0);
    }

    @Test
    void hashIsLowercaseHexSha256() throws IOException {
        String hash = MeasureHasher.hash(measures(resource("base.musicxml")).get(0));

        assertThat(hash).matches("[0-9a-f]{64}");
    }

    /** MH-1: bản OMR (DOCTYPE, thụt dòng, width, default-x, print) và bản Editor serialize lại phải cùng mã băm. */
    @Test
    void layoutAndWhitespaceDoNotChangeHash() throws IOException {
        List<Element> original = measures(resource("base.musicxml"));
        List<Element> reserialized = measures(resource("reserialized.musicxml"));

        assertThat(reserialized).hasSameSizeAs(original);
        for (int i = 0; i < original.size(); i++) {
            assertThat(MeasureHasher.hash(reserialized.get(i)))
                    .as("ô %d", i + 1)
                    .isEqualTo(MeasureHasher.hash(original.get(i)));
        }
    }

    /** MH-2: đổi cao độ thì mã băm khác. */
    @Test
    void changingPitchChangesHash() throws IOException {
        String xml = resource("base.musicxml");
        String edited = xml.replace("<step>D</step>", "<step>F</step>");

        assertThat(MeasureHasher.hash(measures(edited).get(1)))
                .isNotEqualTo(MeasureHasher.hash(measures(xml).get(1)));
        assertThat(MeasureHasher.hash(measures(edited).get(0)))
                .isEqualTo(MeasureHasher.hash(measures(xml).get(0)));
    }

    /** MH-3: số thứ tự ô không thuộc nội dung (đánh số lại không làm ô "đổi"). */
    @Test
    void measureNumberIsIgnoredButNotChildNumbers() {
        Element one = wrap(
                "<measure number=\"1\"><attributes><clef number=\"1\"><sign>G</sign></clef></attributes></measure>");
        Element seven = wrap(
                "<measure number=\"7\"><attributes><clef number=\"1\"><sign>G</sign></clef></attributes></measure>");
        Element otherStaff = wrap(
                "<measure number=\"1\"><attributes><clef number=\"2\"><sign>G</sign></clef></attributes></measure>");

        assertThat(MeasureHasher.hash(seven)).isEqualTo(MeasureHasher.hash(one));
        assertThat(MeasureHasher.hash(otherStaff)).isNotEqualTo(MeasureHasher.hash(one));
    }

    /** MH-4: thứ tự thuộc tính và dạng đóng thẻ không ảnh hưởng. */
    @Test
    void attributeOrderAndEmptyElementFormAreIgnored() {
        Element a = wrap("<measure number=\"1\"><note a=\"1\" b=\"2\"><rest/></note></measure>");
        Element b = wrap("<measure number=\"1\"><note b=\"2\" a=\"1\"><rest></rest></note></measure>");

        assertThat(MeasureHasher.hash(a)).isEqualTo(MeasureHasher.hash(b));
    }

    /** MH-5: ignoreHarmony bỏ hợp âm; mặc định thì hợp âm được tính. */
    @Test
    void harmonyCountsUnlessIgnored() {
        Element withChord = wrap(
                "<measure number=\"1\"><harmony><root><root-step>C</root-step></root><kind>major</kind></harmony><note><rest/></note></measure>");
        Element withoutChord = wrap("<measure number=\"1\"><note><rest/></note></measure>");

        assertThat(MeasureHasher.hash(withChord)).isNotEqualTo(MeasureHasher.hash(withoutChord));
        assertThat(MeasureHasher.hash(withChord, true)).isEqualTo(MeasureHasher.hash(withoutChord, true));
    }

    /** MH-6: text được cắt khoảng trắng nhưng nội dung khác vẫn khác. */
    @Test
    void textIsTrimmedButContentMatters() {
        Element spaced = wrap("<measure number=\"1\"><note><lyric><text>  la </text></lyric></note></measure>");
        Element tight = wrap("<measure number=\"1\"><note><lyric><text>la</text></lyric></note></measure>");
        Element other = wrap("<measure number=\"1\"><note><lyric><text>lo</text></lyric></note></measure>");

        assertThat(MeasureHasher.hash(spaced)).isEqualTo(MeasureHasher.hash(tight));
        assertThat(MeasureHasher.hash(other)).isNotEqualTo(MeasureHasher.hash(tight));
    }
}
