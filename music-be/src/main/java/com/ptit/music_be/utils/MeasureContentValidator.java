package com.ptit.music_be.utils;

import java.util.Set;

import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

/**
 * Kiểm nội dung nhạc của ô nhịp MusicXML trước khi nhận (T48, C-02). Parser chỉ kiểm cấu trúc XML, nên trước đây phiên
 * cùng sửa nhận cả nốt {@code <step>H</step>}, quãng 99, trường độ âm, {@code <type>banana</type>}, phát cho mọi người và
 * lưu thành phiên bản. Chỉ kiểm các giá trị mà trình soạn, Player và xuất file dựa vào; phần tử lạ khác vẫn để nguyên.
 */
public final class MeasureContentValidator {

    private static final Set<String> STEPS = Set.of("A", "B", "C", "D", "E", "F", "G");
    private static final Set<String> NOTE_TYPES = Set.of(
            "1024th", "512th", "256th", "128th", "64th", "32nd", "16th", "eighth", "quarter", "half", "whole", "breve",
            "long", "maxima");

    private MeasureContentValidator() {}

    /** Mọi ô trong mọi part của bản nhạc đều hợp lệ. */
    public static boolean isValidScore(Element root) {
        NodeList measures = root.getElementsByTagName("measure");
        for (int index = 0; index < measures.getLength(); index++) {
            if (!isValidMeasure((Element) measures.item(index))) {
                return false;
            }
        }
        return true;
    }

    /** Ô nhịp hợp lệ: các nốt có cao độ, trường độ, loại nốt đúng miền giá trị. */
    public static boolean isValidMeasure(Element measure) {
        if (measure == null || !"measure".equals(measure.getTagName())) {
            return false;
        }
        for (Node child = measure.getFirstChild(); child != null; child = child.getNextSibling()) {
            if (!(child instanceof Element element)) {
                continue;
            }
            switch (element.getTagName()) {
                case "note" -> {
                    if (!isValidNote(element)) {
                        return false;
                    }
                }
                case "backup", "forward" -> {
                    if (!isNonNegativeNumber(text(element, "duration"))) {
                        return false;
                    }
                }
                default -> {
                    // thuộc tính, hướng dẫn, vạch nhịp... không kiểm ở đây
                }
            }
        }
        return true;
    }

    static boolean isValidNote(Element note) {
        Element pitch = child(note, "pitch");
        if (pitch != null) {
            String step = text(pitch, "step");
            if (step == null || !STEPS.contains(step)) {
                return false;
            }
            Integer octave = integer(text(pitch, "octave"));
            if (octave == null || octave < 0 || octave > 9) {
                return false;
            }
            String alter = text(pitch, "alter");
            if (alter != null) {
                try {
                    double value = Double.parseDouble(alter);
                    if (!Double.isFinite(value) || Math.abs(value) > 2) {
                        return false;
                    }
                } catch (NumberFormatException e) {
                    return false;
                }
            }
        }
        boolean grace = child(note, "grace") != null;
        String duration = text(note, "duration");
        // nốt hoa mỹ không có trường độ; nốt thường phải có trường độ không âm (một số file OMR ghi 0, vẫn nhận)
        if (grace ? duration != null && !isNonNegativeNumber(duration) : !isNonNegativeNumber(duration)) {
            return false;
        }
        String type = text(note, "type");
        return type == null || NOTE_TYPES.contains(type);
    }

    private static boolean isNonNegativeNumber(String value) {
        if (value == null) {
            return false;
        }
        try {
            double number = Double.parseDouble(value);
            return Double.isFinite(number) && number >= 0;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    private static Integer integer(String value) {
        if (value == null) {
            return null;
        }
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Element child(Element parent, String name) {
        for (Node node = parent.getFirstChild(); node != null; node = node.getNextSibling()) {
            if (node instanceof Element element && name.equals(element.getTagName())) {
                return element;
            }
        }
        return null;
    }

    private static String text(Element parent, String name) {
        Element element = child(parent, name);
        return element == null ? null : element.getTextContent().trim();
    }
}
