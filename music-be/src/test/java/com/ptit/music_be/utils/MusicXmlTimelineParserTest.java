package com.ptit.music_be.utils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;

import com.ptit.music_be.dto.response.StudioTimelineResponse;
import com.ptit.music_be.exception.AppException;

class MusicXmlTimelineParserTest {

    private static StudioTimelineResponse parse(String score) {
        return MusicXmlTimelineParser.parse(
                "score-1", "hash", "Test score", 100, score.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void buildsChordStepsAndQuarterNoteBeats() {
        StudioTimelineResponse timeline = parse("""
				<score-partwise version="3.1">
				<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
				<part id="P1">
					<measure number="1">
					<attributes><divisions>2</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
					<direction><sound tempo="120"/></direction>
					<note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff></note>
					<note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff></note>
					<forward><duration>2</duration></forward>
					<note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff></note>
					</measure>
				</part>
				</score-partwise>
				""");

        assertThat(timeline.measureCount()).isEqualTo(1);
        assertThat(timeline.tempoBpm()).isEqualTo(120);
        assertThat(timeline.measures()).containsExactly(new StudioTimelineResponse.Measure(1, 0, 3));
        assertThat(timeline.notes())
                .extracting(StudioTimelineResponse.Note::midi)
                .containsExactly(60, 64, 67);
        assertThat(timeline.notes().get(0).chordGroupId())
                .isEqualTo(timeline.notes().get(1).chordGroupId());
        assertThat(timeline.notes().get(0).startBeat()).isZero();
        assertThat(timeline.notes().get(2).startBeat()).isEqualTo(2);
        assertThat(timeline.steps()).hasSize(2);
        assertThat(timeline.steps().get(0).noteIds()).containsExactly("n0001", "n0002");
    }

    @Test
    void backupPositionsSecondStaffAtTheStartOfTheMeasure() {
        StudioTimelineResponse timeline = parse("""
				<score-partwise version="3.1">
				<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
				<part id="P1">
					<measure number="1">
					<attributes><divisions>2</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
					<note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff></note>
					<note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff></note>
					<backup><duration>4</duration></backup>
					<note><pitch><step>G</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><staff>2</staff></note>
					</measure>
				</part>
				</score-partwise>
				""");

        assertThat(timeline.notes())
                .extracting(StudioTimelineResponse.Note::startBeat)
                .containsExactly(0.0, 0.0, 1.0);
        assertThat(timeline.notes().get(1).hand()).isEqualTo("LEFT");
        assertThat(timeline.steps()).hasSize(2);
        assertThat(timeline.steps().getFirst().noteIds()).containsExactly("n0001", "n0002");
    }

    @Test
    void tiedContinuationIsNotScorableAndGraceNotesAreNotScorable() {
        StudioTimelineResponse timeline = parse("""
				<score-partwise version="3.1">
				<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
				<part id="P1">
					<measure number="1">
					<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
					<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><tie type="start"/></note>
					<note><grace/><pitch><step>D</step><octave>4</octave></pitch></note>
					</measure>
					<measure number="2">
					<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><tie type="stop"/></note>
					</measure>
				</part>
				</score-partwise>
				""");

        assertThat(timeline.notes()).hasSize(3);
        assertThat(timeline.notes().get(0).durationBeat()).isEqualTo(2);
        assertThat(timeline.notes().get(0).scorable()).isTrue();
        assertThat(timeline.notes().get(1).scorable()).isFalse();
        assertThat(timeline.notes().get(2).scorable()).isFalse();
        assertThat(timeline.steps()).hasSize(1);
        assertThat(timeline.measures())
                .extracting(StudioTimelineResponse.Measure::startBeat)
                .containsExactly(0.0, 4.0);
    }

    @Test
    void reportsRepeatWarningsAndLaterTempoChanges() {
        StudioTimelineResponse timeline = parse("""
				<score-partwise version="3.1">
				<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
				<part id="P1">
					<measure number="1">
					<attributes><divisions>1</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
					<note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration></note>
					<barline><repeat direction="forward"/></barline>
					</measure>
					<measure number="2">
					<direction><sound tempo="80"/></direction>
					<note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration></note>
					</measure>
				</part>
				</score-partwise>
				""");

        assertThat(timeline.tempoBpm()).isEqualTo(100);
        assertThat(timeline.tempoChanges()).containsExactly(new StudioTimelineResponse.TempoChange(2, 80));
        assertThat(timeline.warnings()).isNotEmpty();
    }

    @Test
    void rejectsMalformedMusicXml() {
        assertThatThrownBy(() -> parse("<score-partwise><part>")).isInstanceOf(AppException.class);
    }
}
