package com.ptit.music_be.utils;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import com.ptit.music_be.dto.response.StudioTimelineResponse;
import com.ptit.music_be.dto.response.StudioTimelineResponse.Measure;
import com.ptit.music_be.dto.response.StudioTimelineResponse.Note;
import com.ptit.music_be.dto.response.StudioTimelineResponse.OsmdPosition;
import com.ptit.music_be.dto.response.StudioTimelineResponse.Step;
import com.ptit.music_be.dto.response.StudioTimelineResponse.TempoChange;
import com.ptit.music_be.dto.response.StudioTimelineResponse.TimeSignature;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.code.ScoreErrorCode;

/** Builds the score timeline used by the interactive practice studio. */
public final class MusicXmlTimelineParser {

    private static final Map<String, Integer> STEP_SEMITONES =
            Map.of("C", 0, "D", 2, "E", 4, "F", 5, "G", 7, "A", 9, "B", 11);

    private MusicXmlTimelineParser() {}

    public static StudioTimelineResponse parse(
            String scoreId, String contentHash, String title, int fallbackTempoBpm, byte[] xml) {
        Document document = MusicXmlInspector.parseStored(xml);
        Element root = document.getDocumentElement();
        if (root == null || !"score-partwise".equals(root.getTagName())) {
            throw new AppException(ScoreErrorCode.MUSICXML_INVALID);
        }

        List<Element> parts = childElements(root, "part");
        if (parts.isEmpty()) {
            throw new AppException(ScoreErrorCode.MUSICXML_INVALID);
        }

        int measureCount = parts.stream()
                .mapToInt(part -> childElements(part, "measure").size())
                .max()
                .orElse(0);
        if (measureCount == 0) {
            throw new AppException(ScoreErrorCode.MUSICXML_INVALID);
        }

        Map<Integer, TimeSignature> signatures = new TreeMap<>();
        Map<Integer, Integer> tempos = new TreeMap<>();
        double[] measureLengths = new double[measureCount + 1];
        List<RawNote> rawNotes = new ArrayList<>();
        boolean hasRepeats = false;

        for (int partIndex = 0; partIndex < parts.size(); partIndex++) {
            Element part = parts.get(partIndex);
            List<Element> partMeasures = childElements(part, "measure");
            int divisions = 1;
            Map<TieKey, RawNote> openTies = new HashMap<>();

            for (int measureIndex = 0; measureIndex < partMeasures.size(); measureIndex++) {
                Element measure = partMeasures.get(measureIndex);
                int measureNumber = measureIndex + 1;
                double cursor = 0;
                double furthestBeat = 0;
                int nextEntryIndex = 0;
                Map<String, RawNote> previousNoteByVoice = new HashMap<>();
                Map<String, Integer> entryIndices = new LinkedHashMap<>();

                for (Element child : childElements(measure, null)) {
                    switch (child.getTagName()) {
                        case "attributes" -> {
                            String divisionsText = childText(child, "divisions");
                            if (divisionsText != null) {
                                divisions = positiveInteger(divisionsText);
                            }
                            Element time = firstChild(child, "time");
                            if (time != null) {
                                TimeSignature signature = parseTimeSignature(measureNumber, time);
                                if (signature != null) {
                                    signatures.putIfAbsent(measureNumber, signature);
                                }
                            }
                        }
                        case "direction" -> {
                            Integer bpm = firstTempo(child);
                            if (bpm != null) {
                                tempos.putIfAbsent(measureNumber, bpm);
                            }
                        }
                        case "note" -> {
                            boolean chord = firstChild(child, "chord") != null;
                            boolean grace = firstChild(child, "grace") != null;
                            double duration = duration(child, divisions);
                            int staff = positiveIntegerOrDefault(childText(child, "staff"), 1);
                            int voice = positiveIntegerOrDefault(childText(child, "voice"), 1);
                            String voiceKey = staff + ":" + voice;
                            RawNote previous = previousNoteByVoice.get(voiceKey);
                            double start = chord && previous != null ? previous.localStartBeat : cursor;
                            int midi = midi(child);
                            String groupKey = chord && previous != null
                                    ? previous.groupKey
                                    : partIndex + ":" + measureNumber + ":" + voiceKey + ":" + beatKey(start);
                            String entryKey = voiceKey + ":" + beatKey(start);
                            Integer entryIndex = entryIndices.get(entryKey);
                            if (entryIndex == null) {
                                entryIndex = nextEntryIndex++;
                                entryIndices.put(entryKey, entryIndex);
                            }

                            if (midi >= 0) {
                                boolean tieStart = hasTie(child, "start");
                                boolean tieStop = hasTie(child, "stop");
                                RawNote note = new RawNote(
                                        partIndex,
                                        measureNumber,
                                        staff,
                                        voice,
                                        midi,
                                        start,
                                        duration,
                                        !grace && !tieStop,
                                        groupKey,
                                        entryIndex);
                                rawNotes.add(note);
                                previousNoteByVoice.put(voiceKey, note);

                                TieKey tieKey = new TieKey(staff, voice, midi);
                                RawNote tiedStart = openTies.get(tieKey);
                                if (tieStop && tiedStart != null) {
                                    tiedStart.durationBeat = roundBeat(tiedStart.durationBeat + duration);
                                    note.scorable = false;
                                    if (!tieStart) {
                                        openTies.remove(tieKey);
                                    }
                                } else if (tieStart) {
                                    openTies.put(tieKey, note);
                                } else if (tieStop) {
                                    note.scorable = false;
                                }
                            } else {
                                previousNoteByVoice.remove(voiceKey);
                            }

                            if (!chord) {
                                cursor = roundBeat(cursor + duration);
                                furthestBeat = Math.max(furthestBeat, cursor);
                            }
                        }
                        case "backup" -> {
                            cursor = roundBeat(cursor - duration(child, divisions));
                            if (cursor < -0.000001) {
                                throw new AppException(ScoreErrorCode.MUSICXML_INVALID);
                            }
                        }
                        case "forward" -> {
                            cursor = roundBeat(cursor + duration(child, divisions));
                            furthestBeat = Math.max(furthestBeat, cursor);
                        }
                        case "barline" -> hasRepeats |= containsRepeat(child);
                        default -> {
                            // Other MusicXML elements do not affect note timing.
                        }
                    }
                }

                measureLengths[measureNumber] = Math.max(measureLengths[measureNumber], furthestBeat);
            }
        }

        List<TimeSignature> timeSignatures = new ArrayList<>(signatures.values());
        double[] measureStarts = new double[measureCount + 1];
        TimeSignature activeSignature = null;
        List<Measure> measures = new ArrayList<>(measureCount);
        for (int measureNumber = 1; measureNumber <= measureCount; measureNumber++) {
            TimeSignature signature = signatures.get(measureNumber);
            if (signature != null) {
                activeSignature = signature;
            }
            double signatureLength =
                    activeSignature == null ? 0 : activeSignature.beats() * 4.0 / activeSignature.beatType();
            double length = roundBeat(Math.max(signatureLength, measureLengths[measureNumber]));
            if (length <= 0) {
                throw new AppException(ScoreErrorCode.MUSICXML_INVALID);
            }
            measureStarts[measureNumber] = roundBeat(measureStarts[measureNumber - 1] + length);
            measures.add(new Measure(measureNumber, measureStarts[measureNumber - 1], length));
        }

        rawNotes.sort(Comparator.comparingInt((RawNote note) -> note.measure)
                .thenComparingDouble(note -> note.localStartBeat)
                .thenComparingInt(note -> note.partIndex)
                .thenComparingInt(note -> note.staff)
                .thenComparingInt(note -> note.voice)
                .thenComparingInt(note -> note.entryIndex));

        Map<String, Integer> chordSizes = new HashMap<>();
        for (RawNote note : rawNotes) {
            chordSizes.merge(note.groupKey, 1, Integer::sum);
        }
        Map<String, String> chordIds = new HashMap<>();
        List<Note> notes = new ArrayList<>(rawNotes.size());
        Map<Double, List<String>> scorableNotesByBeat = new TreeMap<>();
        for (int index = 0; index < rawNotes.size(); index++) {
            RawNote note = rawNotes.get(index);
            String noteId = "n%04d".formatted(index + 1);
            String chordId = chordSizes.get(note.groupKey) > 1
                    ? chordIds.computeIfAbsent(note.groupKey, ignored -> "c%04d".formatted(chordIds.size() + 1))
                    : null;
            double startBeat = roundBeat(measureStarts[note.measure - 1] + note.localStartBeat);
            notes.add(new Note(
                    noteId,
                    note.measure,
                    note.staff,
                    note.staff == 1 ? "RIGHT" : "LEFT",
                    note.midi,
                    startBeat,
                    note.durationBeat,
                    note.scorable,
                    chordId,
                    new OsmdPosition(note.measure - 1, note.voice, note.entryIndex)));
            if (note.scorable) {
                scorableNotesByBeat
                        .computeIfAbsent(startBeat, ignored -> new ArrayList<>())
                        .add(noteId);
            }
        }

        List<Step> steps = new ArrayList<>(scorableNotesByBeat.size());
        int stepIndex = 0;
        for (Map.Entry<Double, List<String>> entry : scorableNotesByBeat.entrySet()) {
            steps.add(new Step(stepIndex++, entry.getKey(), List.copyOf(entry.getValue())));
        }

        Integer firstTempo = tempos.get(1);
        int tempoBpm = firstTempo == null ? fallbackTempoBpm : firstTempo;
        List<TempoChange> tempoChanges = tempos.entrySet().stream()
                .filter(entry -> entry.getKey() > 1)
                .map(entry -> new TempoChange(entry.getKey(), entry.getValue()))
                .toList();
        List<String> warnings =
                hasRepeats ? List.of("Repeats and voltas are not expanded in the timeline.") : List.of();

        return new StudioTimelineResponse(
                scoreId,
                contentHash,
                title,
                measureCount,
                tempoBpm,
                timeSignatures,
                tempoChanges,
                measures,
                notes,
                steps,
                warnings);
    }

    private static List<Element> childElements(Element parent, String name) {
        List<Element> result = new ArrayList<>();
        NodeList children = parent.getChildNodes();
        for (int index = 0; index < children.getLength(); index++) {
            Node node = children.item(index);
            if (node instanceof Element element && (name == null || name.equals(element.getTagName()))) {
                result.add(element);
            }
        }
        return result;
    }

    private static Element firstChild(Element parent, String name) {
        for (Element child : childElements(parent, name)) {
            return child;
        }
        return null;
    }

    private static String childText(Element parent, String name) {
        Element child = firstChild(parent, name);
        if (child == null || child.getTextContent().isBlank()) {
            return null;
        }
        return child.getTextContent().trim();
    }

    private static double duration(Element element, int divisions) {
        String text = childText(element, "duration");
        if (text == null) {
            return 0;
        }
        try {
            double value = Double.parseDouble(text);
            if (!Double.isFinite(value) || value < 0) {
                throw new NumberFormatException();
            }
            return roundBeat(value / divisions);
        } catch (NumberFormatException exception) {
            throw new AppException(ScoreErrorCode.MUSICXML_INVALID);
        }
    }

    private static int midi(Element note) {
        Element pitch = firstChild(note, "pitch");
        if (pitch == null) {
            return -1;
        }
        String step = childText(pitch, "step");
        String octaveText = childText(pitch, "octave");
        Integer semitones = STEP_SEMITONES.get(step);
        if (semitones == null || octaveText == null) {
            throw new AppException(ScoreErrorCode.MUSICXML_INVALID);
        }
        try {
            int octave = Integer.parseInt(octaveText);
            String alterText = childText(pitch, "alter");
            double alter = alterText == null ? 0 : Double.parseDouble(alterText);
            return (octave + 1) * 12 + semitones + (int) Math.round(alter);
        } catch (NumberFormatException exception) {
            throw new AppException(ScoreErrorCode.MUSICXML_INVALID);
        }
    }

    private static boolean hasTie(Element note, String tieType) {
        for (Element tie : childElements(note, "tie")) {
            if (tieType.equals(tie.getAttribute("type"))) {
                return true;
            }
        }
        for (Element notations : childElements(note, "notations")) {
            for (Element tied : childElements(notations, "tied")) {
                if (tieType.equals(tied.getAttribute("type"))) {
                    return true;
                }
            }
        }
        return false;
    }

    private static TimeSignature parseTimeSignature(int measure, Element time) {
        String beatsText = childText(time, "beats");
        String beatTypeText = childText(time, "beat-type");
        if (beatsText == null || beatTypeText == null || beatsText.contains("/")) {
            return null;
        }
        int beats;
        try {
            beats = 0;
            for (String part : beatsText.split("\\+")) {
                beats += Integer.parseInt(part.trim());
            }
            int beatType = Integer.parseInt(beatTypeText);
            if (beats <= 0 || beatType <= 0) {
                throw new NumberFormatException();
            }
            return new TimeSignature(measure, beats, beatType);
        } catch (NumberFormatException exception) {
            throw new AppException(ScoreErrorCode.MUSICXML_INVALID);
        }
    }

    private static Integer firstTempo(Element direction) {
        NodeList sounds = direction.getElementsByTagName("sound");
        for (int index = 0; index < sounds.getLength(); index++) {
            String value = ((Element) sounds.item(index)).getAttribute("tempo");
            if (!value.isBlank()) {
                try {
                    double bpm = Double.parseDouble(value.trim());
                    if (Double.isFinite(bpm) && bpm > 0) {
                        return (int) Math.round(bpm);
                    }
                } catch (NumberFormatException exception) {
                    throw new AppException(ScoreErrorCode.MUSICXML_INVALID);
                }
            }
        }
        return null;
    }

    private static boolean containsRepeat(Element barline) {
        for (Element repeat : childElements(barline, "repeat")) {
            if ("forward".equals(repeat.getAttribute("direction"))
                    || "backward".equals(repeat.getAttribute("direction"))) {
                return true;
            }
        }
        return false;
    }

    private static int positiveInteger(String value) {
        try {
            int parsed = Integer.parseInt(value);
            if (parsed > 0) {
                return parsed;
            }
        } catch (NumberFormatException ignored) {
            // Report invalid numeric MusicXML through the same public error code.
        }
        throw new AppException(ScoreErrorCode.MUSICXML_INVALID);
    }

    private static int positiveIntegerOrDefault(String value, int fallback) {
        return value == null ? fallback : positiveInteger(value);
    }

    private static double roundBeat(double beat) {
        return Math.round(beat * 1_000_000d) / 1_000_000d;
    }

    private static String beatKey(double beat) {
        return Double.toString(roundBeat(beat));
    }

    private record TieKey(int staff, int voice, int midi) {}

    private static final class RawNote {
        private final int partIndex;
        private final int measure;
        private final int staff;
        private final int voice;
        private final int midi;
        private final double localStartBeat;
        private double durationBeat;
        private boolean scorable;
        private final String groupKey;
        private final int entryIndex;

        private RawNote(
                int partIndex,
                int measure,
                int staff,
                int voice,
                int midi,
                double localStartBeat,
                double durationBeat,
                boolean scorable,
                String groupKey,
                int entryIndex) {
            this.partIndex = partIndex;
            this.measure = measure;
            this.staff = staff;
            this.voice = voice;
            this.midi = midi;
            this.localStartBeat = localStartBeat;
            this.durationBeat = durationBeat;
            this.scorable = scorable;
            this.groupKey = groupKey;
            this.entryIndex = entryIndex;
        }
    }
}
