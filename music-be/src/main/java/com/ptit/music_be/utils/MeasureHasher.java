package com.ptit.music_be.utils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

import org.w3c.dom.Element;
import org.w3c.dom.NamedNodeMap;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

/**
 * Băm một phần tử MusicXML (thường là {@code <measure>}) sau khi chuẩn hóa, để hai ô nhịp "giống nhau về nội dung" cho ra
 * cùng mã băm dù được lưu bởi OMR, MuseScore hay Editor (đề xuất sửa, mục 4.3).
 *
 * <p>Quy tắc chuẩn hóa, rồi SHA-256 dạng hex chữ thường trên chuỗi UTF-8:
 *
 * <ul>
 *   <li>Bỏ mọi phần tử {@code <print>} (chỉ là ngắt dòng/ngắt trang).
 *   <li>Bỏ thuộc tính chỉ để trình bày: {@code default-x}, {@code default-y}, {@code relative-x}, {@code relative-y} ở mọi
 *       phần tử; riêng phần tử {@code <measure>} gốc bỏ thêm {@code width}, {@code implicit}, {@code number}.
 *   <li>Bỏ text chỉ có khoảng trắng; text còn lại được cắt khoảng trắng hai đầu.
 *   <li>Thuộc tính sắp theo tên; không có khai báo XML, không thụt dòng; {@code <a/>} và {@code <a></a>} như nhau.
 *   <li>Tùy chọn {@code ignoreHarmony}: bỏ mọi {@code <harmony>} (so sánh nốt mà không tính hợp âm).
 * </ul>
 *
 * Lớp không giữ trạng thái nên dùng chung được giữa các luồng.
 */
public final class MeasureHasher {

    private static final String PRINT = "print";
    private static final String HARMONY = "harmony";

    private static final Set<String> LAYOUT_ATTRIBUTES = Set.of("default-x", "default-y", "relative-x", "relative-y");
    private static final Set<String> MEASURE_ONLY_ATTRIBUTES = Set.of("width", "implicit", "number");

    private MeasureHasher() {}

    /** Mã băm của ô nhịp, có tính hợp âm. */
    public static String hash(Element measure) {
        return hash(measure, false);
    }

    /**
     * Mã băm của ô nhịp.
     *
     * @param ignoreHarmony {@code true} thì bỏ các {@code <harmony>} trước khi băm
     */
    public static String hash(Element measure, boolean ignoreHarmony) {
        return sha256Hex(canonical(measure, true, ignoreHarmony));
    }

    /**
     * Mã băm của một phần tử bất kỳ (khóa, nhịp, {@code <part-list>}...): chuẩn hóa như ô nhịp nhưng giữ cả thuộc tính
     * {@code number}, {@code width}, {@code implicit}.
     */
    public static String hashElement(Element element) {
        return sha256Hex(canonical(element, false, false));
    }

    /** SHA-256 của chuỗi UTF-8, dạng hex chữ thường 64 ký tự. */
    public static String sha256Hex(String text) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 luôn có trong JDK", e);
        }
    }

    private static String canonical(Element root, boolean measureRoot, boolean ignoreHarmony) {
        StringBuilder out = new StringBuilder();
        append(out, root, measureRoot, ignoreHarmony);
        return out.toString();
    }

    private static void append(StringBuilder out, Element element, boolean measureRoot, boolean ignoreHarmony) {
        String tag = element.getTagName();
        out.append('<').append(tag);
        for (Map.Entry<String, String> attribute :
                attributesOf(element, measureRoot).entrySet()) {
            out.append(' ')
                    .append(attribute.getKey())
                    .append("=\"")
                    .append(escape(attribute.getValue()))
                    .append('"');
        }
        out.append('>');
        NodeList children = element.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            Node child = children.item(i);
            if (child instanceof Element childElement) {
                String name = childElement.getTagName();
                if (PRINT.equals(name) || (ignoreHarmony && HARMONY.equals(name))) {
                    continue;
                }
                append(out, childElement, false, ignoreHarmony);
            } else if (child.getNodeType() == Node.TEXT_NODE || child.getNodeType() == Node.CDATA_SECTION_NODE) {
                String text = child.getNodeValue().trim();
                if (!text.isEmpty()) {
                    out.append(escape(text));
                }
            }
        }
        out.append("</").append(tag).append('>');
    }

    /** Thuộc tính còn lại sau khi bỏ phần trình bày, sắp theo tên. */
    private static Map<String, String> attributesOf(Element element, boolean measureRoot) {
        Map<String, String> sorted = new TreeMap<>();
        NamedNodeMap attributes = element.getAttributes();
        for (int i = 0; i < attributes.getLength(); i++) {
            Node attribute = attributes.item(i);
            String name = attribute.getNodeName();
            if (LAYOUT_ATTRIBUTES.contains(name) || (measureRoot && MEASURE_ONLY_ATTRIBUTES.contains(name))) {
                continue;
            }
            sorted.put(name, attribute.getNodeValue());
        }
        return sorted;
    }

    private static String escape(String text) {
        return text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
    }
}
