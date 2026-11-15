package com.ptit.music_be.service.score.impl;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.ptit.music_be.service.score.impl.LiveDocument.MeasureEdit;
import com.ptit.music_be.service.score.impl.LiveDocument.Outcome;
import com.ptit.music_be.service.score.impl.LiveDocument.Reason;
import com.ptit.music_be.utils.MeasureHasher;
import com.ptit.music_be.utils.MusicXmlInspector;

class LiveDocumentTest {

    private static final String ATTRIBUTES = "<attributes><divisions>1</divisions><key><fifths>0</fifths></key>"
            + "<time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>";

    private static String note(String step) {
        return "<note><pitch><step>" + step + "</step><octave>4</octave></pitch><duration>4</duration>"
                + "<type>whole</type></note>";
    }

    private static String measure(int number, String step) {
        String attributes = number == 1 ? ATTRIBUTES : "";
        return "<measure number=\"" + number + "\">" + attributes + note(step) + "</measure>";
    }

    private static String score(String... measures) {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><score-partwise version=\"4.0\"><part-list>"
                + "<score-part id=\"P1\"><part-name>Piano</part-name></score-part></part-list><part id=\"P1\">"
                + String.join("", measures) + "</part></score-partwise>";
    }

    private static LiveDocument open(String xml) {
        return LiveDocument.open(xml.getBytes(StandardCharsets.UTF_8), 3, 0);
    }

    private static String hashOf(String measureXml) {
        return MeasureHasher.hash(MusicXmlInspector.parseStored(measureXml.getBytes(StandardCharsets.UTF_8))
                .getDocumentElement());
    }

    private static MeasureEdit edit(int measureIndex, String beforeXml, String afterXml) {
        return new MeasureEdit(0, measureIndex, hashOf(beforeXml), afterXml);
    }

    @Test
    void acceptsEditWhoseBeforeHashMatches() {
        LiveDocument doc = open(score(measure(1, "C"), measure(2, "D")));

        Outcome outcome = doc.applyMeasures("op-1", List.of(edit(1, measure(2, "D"), measure(2, "E"))));

        assertThat(outcome.applied()).isTrue();
        assertThat(outcome.seq()).isEqualTo(1);
        assertThat(outcome.measures()).hasSize(1);
        assertThat(outcome.measures().get(0).xml()).contains("<step>E</step>");
        assertThat(doc.fullXml()).contains("<step>E</step>").doesNotContain("<step>D</step>");
        assertThat(doc.hasUnsaved()).isTrue();
    }

    /** Hai người cùng sửa một ô: người đến sau có beforeHash cũ nên bị từ chối và nhận lại ô hiện tại. */
    @Test
    void rejectsStaleBeforeHashWithCurrentMeasure() {
        LiveDocument doc = open(score(measure(1, "C"), measure(2, "D")));
        doc.applyMeasures("a", List.of(edit(1, measure(2, "D"), measure(2, "E"))));

        Outcome outcome = doc.applyMeasures("b", List.of(edit(1, measure(2, "D"), measure(2, "F"))));

        assertThat(outcome.applied()).isFalse();
        assertThat(outcome.reason()).isEqualTo(Reason.CONFLICT);
        assertThat(outcome.measures()).hasSize(1);
        assertThat(outcome.measures().get(0).xml()).contains("<step>E</step>");
        assertThat(outcome.seq()).isEqualTo(1);
        assertThat(doc.fullXml()).doesNotContain("<step>F</step>");
    }

    @Test
    void ignoresRepeatedOpId() {
        LiveDocument doc = open(score(measure(1, "C"), measure(2, "D")));
        List<MeasureEdit> edits = List.of(edit(1, measure(2, "D"), measure(2, "E")));
        doc.applyMeasures("same", edits);

        Outcome again = doc.applyMeasures("same", edits);

        assertThat(again.duplicate()).isTrue();
        assertThat(again.applied()).isFalse();
        assertThat(doc.seq()).isEqualTo(1);
    }

    @Test
    void presentationOnlyDifferencesKeepTheSameHash() {
        LiveDocument doc = open(score(measure(1, "C"), measure(2, "D")));
        String sameWithLayout = "<measure number=\"2\" width=\"120\"><print new-system=\"yes\"/>"
                + note("D").replace("<note>", "<note default-x=\"10\">") + "</measure>";

        Outcome outcome = doc.applyMeasures("a", List.of(edit(1, sameWithLayout, measure(2, "E"))));

        assertThat(outcome.applied()).isTrue();
    }

    /** Đổi divisions/khóa/nhịp trong một ô làm đổi cách đọc các ô sau nên không nhận dạng "thay ô". */
    @Test
    void contextChangeMustBeSentAsStructural() {
        LiveDocument doc = open(score(measure(1, "C"), measure(2, "D")));
        String changedTime = measure(1, "C").replace("<beats>4</beats>", "<beats>3</beats>");

        Outcome outcome = doc.applyMeasures("a", List.of(edit(0, measure(1, "C"), changedTime)));

        assertThat(outcome.applied()).isFalse();
        assertThat(outcome.reason()).isEqualTo(Reason.STRUCTURAL_REQUIRED);
        assertThat(doc.seq()).isZero();
    }

    @Test
    void structuralReplacesWholeScoreWhenBaseSeqMatches() {
        LiveDocument doc = open(score(measure(1, "C"), measure(2, "D")));

        Outcome outcome = doc.applyStructural("s1", 0, score(measure(1, "C"), measure(2, "D"), measure(3, "E")));

        assertThat(outcome.applied()).isTrue();
        assertThat(outcome.structuralXml()).contains("number=\"3\"");
        assertThat(doc.shape()).containsExactly(3);
        assertThat(doc.seq()).isEqualTo(1);
    }

    @Test
    void structuralWithOldBaseSeqIsStale() {
        LiveDocument doc = open(score(measure(1, "C"), measure(2, "D")));
        doc.applyMeasures("a", List.of(edit(1, measure(2, "D"), measure(2, "E"))));

        Outcome outcome = doc.applyStructural("s1", 0, score(measure(1, "C")));

        assertThat(outcome.reason()).isEqualTo(Reason.STALE);
        assertThat(doc.shape()).containsExactly(2);
    }

    @Test
    void structuralRejectsMalformedOrDoctypeXml() {
        LiveDocument doc = open(score(measure(1, "C")));

        assertThat(doc.applyStructural("s1", 0, "<not-xml").reason()).isEqualTo(Reason.INVALID);
        assertThat(doc.applyStructural("s2", 0, "<!DOCTYPE x [<!ENTITY e SYSTEM \"file:///etc/passwd\">]><a/>")
                        .reason())
                .isEqualTo(Reason.INVALID);
        assertThat(doc.seq()).isZero();
    }

    @Test
    void rejectsOutOfRangeDuplicateAndMalformedEdits() {
        LiveDocument doc = open(score(measure(1, "C"), measure(2, "D")));
        MeasureEdit ok = edit(1, measure(2, "D"), measure(2, "E"));

        assertThat(doc.applyMeasures("a", List.of(new MeasureEdit(0, 5, "x", "<measure/>")))
                        .reason())
                .isEqualTo(Reason.INVALID);
        assertThat(doc.applyMeasures("b", List.of(new MeasureEdit(2, 0, "x", "<measure/>")))
                        .reason())
                .isEqualTo(Reason.INVALID);
        assertThat(doc.applyMeasures("c", List.of(ok, ok)).reason()).isEqualTo(Reason.INVALID);
        assertThat(doc.applyMeasures("d", List.of(edit(1, measure(2, "D"), "<note/>")))
                        .reason())
                .isEqualTo(Reason.INVALID);
        assertThat(doc.applyMeasures("e", List.of(edit(1, measure(2, "D"), "<measure")))
                        .reason())
                .isEqualTo(Reason.INVALID);
        assertThat(doc.seq()).isZero();
    }

    @Test
    void tracksSavedState() {
        LiveDocument doc = LiveDocument.open(score(measure(1, "C"), measure(2, "D")).getBytes(StandardCharsets.UTF_8), 3, 7);
        assertThat(doc.seq()).isEqualTo(7);
        assertThat(doc.hasUnsaved()).isFalse();

        doc.applyMeasures("a", List.of(edit(1, measure(2, "D"), measure(2, "E"))));
        assertThat(doc.hasUnsaved()).isTrue();
        assertThat(doc.firstUnsavedSeq()).isEqualTo(8);

        doc.markSaved(doc.seq(), 4);
        assertThat(doc.hasUnsaved()).isFalse();
        assertThat(doc.baseVersion()).isEqualTo(4);
    }
}
