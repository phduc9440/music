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

/**
 * Builds the score timeline used by the interactive practice studio.
 *
 * <p>ST-08: dấu nhắc lại (forward/backward, times) và volta (ending 1, 2...) được mở theo thứ tự phát như Player, nên
 * {@code measures}, {@code measureCount} và {@code Note.measure} là thứ tự lượt phát (từ 1); {@code Measure.source} là số
 * ô trên bản nhạc. Tay trái / phải chỉ gán cho part có 2 khuông (khuông 1 = phải, khuông 2 = trái); part 1 khuông (giai
 * điệu, từng bè) không có tay. D.C./D.S./Coda chưa mở, có cảnh báo.
 */
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
        boolean hasJumps = false;
        int[] partStaves = new int[parts.size()];
        RepeatInfo[] repeatInfo = new RepeatInfo[measureCount + 1];
        for (int m = 0; m <= measureCount; m++) {
            repeatInfo[m] = new RepeatInfo();
        }

        for (int partIndex = 0; partIndex < parts.size(); partIndex++) {
            Element part = parts.get(partIndex);
            List<Element> partMeasures = childElements(part, "measure");
            partStaves[partIndex] = 1;
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
                            String stavesText = childText(child, "staves");
                            if (stavesText != null) {
                                partStaves[partIndex] = Math.max(partStaves[partIndex], positiveInteger(stavesText));
                            }
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
                            hasJumps |= hasJump(child);
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
                            partStaves[partIndex] = Math.max(partStaves[partIndex], staff);
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
                        case "barline" -> {
                            // Dấu nhắc lại giống nhau ở mọi part: chỉ đọc ở part đầu
                            if (partIndex == 0) {
                                readBarline(child, repeatInfo[measureNumber]);
                            }
                            hasJumps |= hasJump(child);
                        }
                        case "sound" -> hasJumps |= hasJump(child);
                        default -> {
                            // Other MusicXML elements do not affect note timing.
                        }
                    }
                }

                measureLengths[measureNumber] = Math.max(measureLengths[measureNumber], furthestBeat);
            }
        }

        // Độ dài từng ô trên bản nhạc (theo chỉ nhịp đang có hiệu lực, hoặc dài hơn nếu nốt tràn)
        double[] sourceLengths = new double[measureCount + 1];
        TimeSignature activeSignature = null;
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
            sourceLengths[measureNumber] = length;
        }

        // Thứ tự phát: mở dấu nhắc lại và volta
        spreadEndings(repeatInfo, measureCount);
        List<Integer> playOrder = playOrder(repeatInfo, measureCount);
        boolean unfolded = playOrder.size() != measureCount;
        int playedCount = playOrder.size();
        double[] playStarts = new double[playedCount + 1];
        List<Measure> measures = new ArrayList<>(playedCount);
        List<TimeSignature> timeSignatures = new ArrayList<>();
        Map<Integer, Integer> playedTempos = new TreeMap<>();
        for (int position = 1; position <= playedCount; position++) {
            int source = playOrder.get(position - 1);
            double length = sourceLengths[source];
            playStarts[position] = roundBeat(playStarts[position - 1] + length);
            measures.add(new Measure(position, playStarts[position - 1], length, source));
            TimeSignature signature = signatures.get(source);
            if (signature != null
                    && (timeSignatures.isEmpty() || !sameMeter(timeSignatures.getLast(), signature))) {
                timeSignatures.add(new TimeSignature(position, signature.beats(), signature.beatType()));
            }
            Integer bpm = tempos.get(source);
            if (bpm != null) {
                playedTempos.put(position, bpm);
            }
        }

        rawNotes.sort(Comparator.comparingInt((RawNote note) -> note.measure)
                .thenComparingDouble(note -> note.localStartBeat)
                .thenComparingInt(note -> note.partIndex)
                .thenComparingInt(note -> note.staff)
                .thenComparingInt(note -> note.voice)
                .thenComparingInt(note -> note.entryIndex));
        Map<Integer, List<RawNote>> notesBySource = new HashMap<>();
        for (RawNote note : rawNotes) {
            notesBySource.computeIfAbsent(note.measure, ignored -> new ArrayList<>()).add(note);
        }

        Map<String, Integer> chordSizes = new HashMap<>();
        for (RawNote note : rawNotes) {
            chordSizes.merge(note.groupKey, 1, Integer::sum);
        }
        Map<String, String> chordIds = new HashMap<>();
        List<Note> notes = new ArrayList<>();
        Map<Double, List<String>> scorableNotesByBeat = new TreeMap<>();
        for (int position = 1; position <= playedCount; position++) {
            int source = playOrder.get(position - 1);
            for (RawNote note : notesBySource.getOrDefault(source, List.of())) {
                String noteId = "n%04d".formatted(notes.size() + 1);
                // Mỗi lượt phát là một hợp âm riêng
                String groupKey = note.groupKey + "@" + position;
                String chordId = chordSizes.get(note.groupKey) > 1
                        ? chordIds.computeIfAbsent(groupKey, ignored -> "c%04d".formatted(chordIds.size() + 1))
                        : null;
                double startBeat = roundBeat(playStarts[position - 1] + note.localStartBeat);
                notes.add(new Note(
                        noteId,
                        position,
                        note.staff,
                        handOf(partStaves[note.partIndex], note.staff),
                        note.midi,
                        startBeat,
                        note.durationBeat,
                        note.scorable,
                        chordId,
                        new OsmdPosition(source - 1, note.voice, note.entryIndex)));
                if (note.scorable) {
                    scorableNotesByBeat
                            .computeIfAbsent(startBeat, ignored -> new ArrayList<>())
                            .add(noteId);
                }
            }
        }

        List<Step> steps = new ArrayList<>(scorableNotesByBeat.size());
        int stepIndex = 0;
        for (Map.Entry<Double, List<String>> entry : scorableNotesByBeat.entrySet()) {
            steps.add(new Step(stepIndex++, entry.getKey(), List.copyOf(entry.getValue())));
        }

        Integer firstTempo = playedTempos.get(1);
        int tempoBpm = firstTempo == null ? fallbackTempoBpm : firstTempo;
        List<TempoChange> tempoChanges = playedTempos.entrySet().stream()
                .filter(entry -> entry.getKey() > 1)
                .map(entry -> new TempoChange(entry.getKey(), entry.getValue()))
                .toList();
        List<String> warnings = new ArrayList<>();
        if (unfolded) {
            warnings.add(WARNING_REPEATS_UNFOLDED);
        }
        if (hasJumps) {
            warnings.add(WARNING_JUMPS_NOT_EXPANDED);
        }

        return new StudioTimelineResponse(
                scoreId,
                contentHash,
                title,
                playedCount,
                tempoBpm,
                timeSignatures,
                tempoChanges,
                measures,
                notes,
                steps,
                List.copyOf(warnings));
    }

    /** Mã cảnh báo (web dịch): dấu nhắc lại đã được mở, số ô là theo thứ tự phát. */
    public static final String WARNING_REPEATS_UNFOLDED = "REPEATS_UNFOLDED";
    /** Mã cảnh báo: có D.C., D.S., Coda hoặc Fine nhưng timeline chưa mở các bước nhảy này. */
    public static final String WARNING_JUMPS_NOT_EXPANDED = "JUMPS_NOT_EXPANDED";
    /** Giới hạn số ô sau khi mở nhắc lại, chống file lỗi lặp vô hạn. */
    private static final int MAX_PLAYED_MEASURES_FACTOR = 8;

    /** Tay của một nốt: chỉ part 2 khuông mới có tay (khuông 1 phải, khuông 2 trái). */
    static String handOf(int staves, int staff) {
        if (staves != 2) {
            return null;
        }
        return staff == 1 ? "RIGHT" : "LEFT";
    }

    /**
     * Thứ tự phát các ô (số ô trên bản nhạc, từ 1): nhắc lại về dấu forward gần nhất (hoặc đầu bài), lặp {@code times}
     * lần (mặc định 2); ô thuộc volta chỉ phát ở lượt có số đó.
     */
    static List<Integer> playOrder(RepeatInfo[] info, int measureCount) {
        List<Integer> order = new ArrayList<>();
        Map<Integer, Integer> passesDone = new HashMap<>();
        int repeatStart = 1;
        int pass = 1;
        int measure = 1;
        int limit = measureCount * MAX_PLAYED_MEASURES_FACTOR;
        while (measure <= measureCount && order.size() < limit) {
            RepeatInfo current = info[measure];
            if (current.forward && measure != repeatStart) {
                repeatStart = measure;
                pass = 1;
            }
            if (current.endings != null && !current.endings.contains(pass)) {
                measure++;
                continue;
            }
            if (current.endings == null && measure > 1 && info[measure - 1].endings != null && !current.backward) {
                // ra khỏi khối volta: phần sau là lượt thường
                pass = 1;
            }
            order.add(measure);
            if (current.backward) {
                int done = passesDone.getOrDefault(measure, 1);
                if (done < current.times) {
                    passesDone.put(measure, done + 1);
                    pass = done + 1;
                    measure = repeatStart;
                    continue;
                }
                passesDone.remove(measure);
                repeatStart = measure + 1;
                pass = 1;
            }
            measure++;
        }
        return order;
    }

    private static void readBarline(Element barline, RepeatInfo info) {
        for (Element repeat : childElements(barline, "repeat")) {
            String direction = repeat.getAttribute("direction");
            if ("forward".equals(direction)) {
                info.forward = true;
            } else if ("backward".equals(direction)) {
                info.backward = true;
                String times = repeat.getAttribute("times");
                if (!times.isBlank()) {
                    try {
                        info.times = Math.max(2, Math.min(8, Integer.parseInt(times.trim())));
                    } catch (NumberFormatException ignored) {
                        // giữ mặc định 2 lượt
                    }
                }
            }
        }
        for (Element ending : childElements(barline, "ending")) {
            String numbers = ending.getAttribute("number");
            String type = ending.getAttribute("type");
            if ("stop".equals(type) || "discontinue".equals(type)) {
                info.endingStop = true;
            }
            if ("start".equals(type) && !numbers.isBlank()) {
                List<Integer> passes = new ArrayList<>();
                for (String number : numbers.split("[,\\s]+")) {
                    try {
                        passes.add(Integer.parseInt(number.trim()));
                    } catch (NumberFormatException ignored) {
                        // bỏ số volta không đọc được
                    }
                }
                if (!passes.isEmpty()) {
                    info.endingStart = passes;
                }
            }
        }
    }

    private static boolean hasJump(Element element) {
        for (String attribute : List.of("dacapo", "dalsegno", "tocoda", "fine")) {
            if (element.hasAttribute(attribute)) {
                return true;
            }
        }
        NodeList sounds = element.getElementsByTagName("sound");
        for (int index = 0; index < sounds.getLength(); index++) {
            Element sound = (Element) sounds.item(index);
            for (String attribute : List.of("dacapo", "dalsegno", "tocoda", "fine")) {
                if (sound.hasAttribute(attribute)) {
                    return true;
                }
            }
        }
        return element.getElementsByTagName("segno").getLength() > 0
                || element.getElementsByTagName("coda").getLength() > 0;
    }

    private static boolean sameMeter(TimeSignature left, TimeSignature right) {
        return left.beats() == right.beats() && left.beatType() == right.beatType();
    }

    /** Dấu nhắc lại / volta của một ô (đọc ở part đầu). */
    static final class RepeatInfo {
        boolean forward;
        boolean backward;
        int times = 2;
        /** Ô nằm trong volta: các lượt được phát; null = mọi lượt. */
        List<Integer> endings;
        /** Volta bắt đầu ở ô này (các số lượt) / kết thúc ở ô này. */
        List<Integer> endingStart;
        boolean endingStop;
    }

    /** Gán số lượt của volta cho mọi ô từ ô bắt đầu tới ô kết thúc của nó. */
    static void spreadEndings(RepeatInfo[] info, int measureCount) {
        List<Integer> active = null;
        for (int measure = 1; measure <= measureCount; measure++) {
            if (info[measure].endingStart != null) {
                active = info[measure].endingStart;
            }
            info[measure].endings = active;
            if (info[measure].endingStop) {
                active = null;
            }
        }
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
