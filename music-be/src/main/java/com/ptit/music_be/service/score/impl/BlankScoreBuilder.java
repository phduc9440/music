package com.ptit.music_be.service.score.impl;

import java.nio.charset.StandardCharsets;
import java.util.List;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;

import org.w3c.dom.Document;
import org.w3c.dom.Element;

import com.ptit.music_be.dto.request.score.BlankScoreRequest;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;

/**
 * Dựng MusicXML {@code score-partwise} cho bản nhạc trống: part theo mẫu nhạc
 * cụ, ô đầu có khóa, nhịp, khóa nhạc,
 * tempo; mỗi ô là một dấu lặng nguyên ô đúng trường độ. Chỉ dựng, không kiểm
 * tùy chọn (việc của
 * {@link ScoreCreateServiceImpl}). Lớp không giữ trạng thái.
 */
final class BlankScoreBuilder {

    /**
     * Số đơn vị trường độ của một nốt đen; đủ để mọi mẫu số 2/4/8/16 ra số nguyên.
     */
    static final int DIVISIONS = 4;

    /**
     * Bè của dấu lặng ở khuông thứ nhất và thứ hai (cùng quy ước MuseScore: khuông
     * 2 dùng bè 5).
     */
    private static final int[] STAFF_VOICES = { 1, 5 };

    private record Clef(String sign, int line, int octaveChange) {
    }

    private record PartSpec(String name, List<Clef> clefs) {
    }

    private static final Clef TREBLE = new Clef("G", 2, 0);
    private static final Clef TREBLE_OCTAVE_DOWN = new Clef("G", 2, -1);
    private static final Clef BASS = new Clef("F", 4, 0);

    private BlankScoreBuilder() {
    }

    /** Trường độ của một ô, tính theo {@link #DIVISIONS}. */
    static int measureDuration(int beats, int beatType) {
        return beats * DIVISIONS * 4 / beatType;
    }

    static byte[] build(BlankScoreRequest request) {
        Document document = newDocument();
        Element root = document.createElement("score-partwise");
        root.setAttribute("version", "4.0");
        document.appendChild(root);

        add(add(root, "work"), "work-title", request.getTitle().strip());
        String composer = request.getComposer() == null ? "" : request.getComposer().strip();
        if (!composer.isEmpty()) {
            Element creator = add(add(root, "identification"), "creator", composer);
            creator.setAttribute("type", "composer");
        }

        List<PartSpec> parts = partsOf(request);
        Element partList = add(root, "part-list");
        for (int p = 0; p < parts.size(); p++) {
            Element scorePart = add(partList, "score-part");
            scorePart.setAttribute("id", partId(p));
            add(scorePart, "part-name", parts.get(p).name());
        }
        for (int p = 0; p < parts.size(); p++) {
            appendPart(root, partId(p), parts.get(p), request, p == 0);
        }
        return SuggestionDiffer.serialize(document, false).getBytes(StandardCharsets.UTF_8);
    }

    private static List<PartSpec> partsOf(BlankScoreRequest request) {
        List<Clef> piano = List.of(TREBLE, BASS);
        return switch (request.getPreset()) {
            case PIANO -> List.of(new PartSpec("Piano", piano));
            case VOICE_PIANO -> List.of(new PartSpec("Voice", List.of(TREBLE)), new PartSpec("Piano", piano));
            case GUITAR -> List.of(new PartSpec("Guitar", List.of(TREBLE_OCTAVE_DOWN)));
            case SATB -> List.of(
                    new PartSpec("Soprano", List.of(TREBLE)),
                    new PartSpec("Alto", List.of(TREBLE)),
                    new PartSpec("Tenor", List.of(TREBLE_OCTAVE_DOWN)),
                    new PartSpec("Bass", List.of(BASS)));
        };
    }

    private static String partId(int index) {
        return "P" + (index + 1);
    }

    private static void appendPart(
            Element root, String id, PartSpec spec, BlankScoreRequest request, boolean carriesTempo) {
        Element part = add(root, "part");
        part.setAttribute("id", id);
        int duration = measureDuration(request.getBeats(), request.getBeatType());
        for (int m = 1; m <= request.getMeasures(); m++) {
            Element measure = add(part, "measure");
            measure.setAttribute("number", String.valueOf(m));
            if (m == 1) {
                appendAttributes(measure, spec, request);
                if (carriesTempo) {
                    appendTempo(measure, request.getTempoBpm());
                }
            }
            appendRests(measure, spec.clefs().size(), duration);
        }
    }

    private static void appendAttributes(Element measure, PartSpec spec, BlankScoreRequest request) {
        Element attributes = add(measure, "attributes");
        add(attributes, "divisions", String.valueOf(DIVISIONS));
        Element key = add(attributes, "key");
        add(key, "fifths", String.valueOf(request.getKeyFifths()));
        add(key, "mode", request.getMode().musicXml());
        Element time = add(attributes, "time");
        add(time, "beats", String.valueOf(request.getBeats()));
        add(time, "beat-type", String.valueOf(request.getBeatType()));
        int staves = spec.clefs().size();
        if (staves > 1) {
            add(attributes, "staves", String.valueOf(staves));
        }
        for (int s = 0; s < staves; s++) {
            Clef clef = spec.clefs().get(s);
            Element element = add(attributes, "clef");
            if (staves > 1) {
                element.setAttribute("number", String.valueOf(s + 1));
            }
            add(element, "sign", clef.sign());
            add(element, "line", String.valueOf(clef.line()));
            if (clef.octaveChange() != 0) {
                add(element, "clef-octave-change", String.valueOf(clef.octaveChange()));
            }
        }
    }

    /**
     * Dấu tempo theo nốt đen: hiện chữ ♩ = n và để {@code <sound tempo>} cho phát
     * nhạc.
     */
    private static void appendTempo(Element measure, int bpm) {
        Element direction = add(measure, "direction");
        direction.setAttribute("placement", "above");
        Element metronome = add(add(direction, "direction-type"), "metronome");
        add(metronome, "beat-unit", "quarter");
        add(metronome, "per-minute", String.valueOf(bpm));
        add(direction, "sound").setAttribute("tempo", String.valueOf(bpm));
    }

    /**
     * Một dấu lặng nguyên ô cho mỗi khuông; khuông sau lùi {@code <backup>} về đầu
     * ô.
     */
    private static void appendRests(Element measure, int staves, int duration) {
        for (int s = 0; s < staves; s++) {
            if (s > 0) {
                add(add(measure, "backup"), "duration", String.valueOf(duration));
            }
            Element note = add(measure, "note");
            add(note, "rest").setAttribute("measure", "yes");
            add(note, "duration", String.valueOf(duration));
            add(note, "voice", String.valueOf(STAFF_VOICES[s]));
            if (staves > 1) {
                add(note, "staff", String.valueOf(s + 1));
            }
        }
    }

    private static Element add(Element parent, String name) {
        Element child = parent.getOwnerDocument().createElement(name);
        parent.appendChild(child);
        return child;
    }

    private static Element add(Element parent, String name, String text) {
        Element child = add(parent, name);
        child.setTextContent(text);
        return child;
    }

    private static Document newDocument() {
        try {
            return DocumentBuilderFactory.newInstance().newDocumentBuilder().newDocument();
        } catch (ParserConfigurationException e) {
            throw new AppException(ErrorCode.MUSICXML_INVALID);
        }
    }
}
