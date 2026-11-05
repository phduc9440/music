package com.ptit.music_be.utils;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.ErrorHandler;
import org.xml.sax.SAXException;
import org.xml.sax.SAXParseException;

import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;

/**
 * Đọc MusicXML do Editor gửi lên một cách an toàn rồi tóm tắt metadata (đặc tả mục 3.6).
 *
 * <p>Bộ phân tích tắt hoàn toàn DOCTYPE, thực thể ngoài, DTD ngoài và XInclude nên payload XXE
 * ({@code <!DOCTYPE ... SYSTEM "file:///etc/passwd">}) bị từ chối ngay khi phân tích. Mọi lỗi nội dung đều ném
 * {@link ErrorCode#MUSICXML_INVALID} (2013). Lớp không giữ trạng thái nên dùng chung được giữa các luồng.
 */
public final class MusicXmlInspector {

    /** Tempo dùng khi MusicXML không có {@code <sound tempo>} (giống music-ai). */
    public static final int DEFAULT_TEMPO_BPM = 100;

    private static final String ROOT_ELEMENT = "score-partwise";

    /** Tên khóa trưởng theo số dấu hóa -7..7 (chỉ số = fifths + 7), giống music-ai. */
    private static final String[] MAJOR_KEYS = {
        "Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"
    };

    /** Tên khóa thứ theo số dấu hóa -7..7. */
    private static final String[] MINOR_KEYS = {
        "Abm", "Ebm", "Bbm", "Fm", "Cm", "Gm", "Dm", "Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "A#m"
    };

    private MusicXmlInspector() {}

    /**
     * Phân tích và tóm tắt MusicXML.
     *
     * @param xml nội dung file (UTF-8/UTF-16 theo khai báo XML)
     * @return tóm tắt metadata
     * @throws AppException MUSICXML_INVALID khi XML hỏng, có DOCTYPE, root không phải {@code score-partwise} hoặc không
     *     có {@code <measure>} nào
     */
    public static MusicXmlSummary inspect(byte[] xml) {
        Document document = parse(xml);
        Element root = document.getDocumentElement();
        if (root == null || !ROOT_ELEMENT.equals(root.getTagName())) {
            throw new AppException(ErrorCode.MUSICXML_INVALID);
        }
        List<Element> parts = childElements(root, "part");
        if (parts.isEmpty()) {
            throw new AppException(ErrorCode.MUSICXML_INVALID);
        }
        List<Element> measures = childElements(parts.get(0), "measure");
        if (measures.isEmpty()) {
            throw new AppException(ErrorCode.MUSICXML_INVALID);
        }

        String key = null;
        String time = null;
        int staves = 1;
        Integer tempo = null;
        for (Element measure : measures) {
            for (Element attributes : childElements(measure, "attributes")) {
                if (key == null) {
                    Element keyElement = firstChild(attributes, "key");
                    if (keyElement != null) {
                        key = keyName(intOrNull(childText(keyElement, "fifths")), childText(keyElement, "mode"));
                    }
                }
                if (time == null) {
                    Element timeElement = firstChild(attributes, "time");
                    if (timeElement != null) {
                        String beats = childText(timeElement, "beats");
                        String beatType = childText(timeElement, "beat-type");
                        if (beats != null && beatType != null) {
                            time = beats + "/" + beatType;
                        }
                    }
                }
                Integer declared = intOrNull(childText(attributes, "staves"));
                if (declared != null && declared > 0) {
                    staves = Math.max(staves, declared);
                }
            }
            if (tempo == null) {
                tempo = firstTempo(measure);
            }
        }
        return new MusicXmlSummary(
                measures.size(), key, time, tempo != null && tempo > 0 ? tempo : DEFAULT_TEMPO_BPM, staves);
    }

    // ---------------------------------------------------------------- phân tích an toàn

    private static Document parse(byte[] xml) {
        try {
            DocumentBuilder builder = newSecureFactory().newDocumentBuilder();
            builder.setEntityResolver((publicId, systemId) -> {
                // Không bao giờ nạp tài nguyên ngoài; DOCTYPE đã bị cấm nên đây chỉ là lớp bảo vệ thứ hai
                throw new SAXException("Không cho phép tài nguyên ngoài");
            });
            builder.setErrorHandler(new ErrorHandler() {
                @Override
                public void warning(SAXParseException exception) {
                    // Bỏ qua cảnh báo
                }

                @Override
                public void error(SAXParseException exception) throws SAXException {
                    throw exception;
                }

                @Override
                public void fatalError(SAXParseException exception) throws SAXException {
                    throw exception;
                }
            });
            return builder.parse(new ByteArrayInputStream(xml));
        } catch (SAXException | IOException | ParserConfigurationException | IllegalArgumentException e) {
            throw new AppException(ErrorCode.MUSICXML_INVALID);
        }
    }

    private static DocumentBuilderFactory newSecureFactory() throws ParserConfigurationException {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
        factory.setXIncludeAware(false);
        factory.setExpandEntityReferences(false);
        factory.setNamespaceAware(false);
        factory.setValidating(false);
        return factory;
    }

    // ---------------------------------------------------------------- đọc DOM

    private static List<Element> childElements(Element parent, String name) {
        List<Element> result = new ArrayList<>();
        NodeList children = parent.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            Node node = children.item(i);
            if (node instanceof Element element && name.equals(element.getTagName())) {
                result.add(element);
            }
        }
        return result;
    }

    private static Element firstChild(Element parent, String name) {
        List<Element> found = childElements(parent, name);
        return found.isEmpty() ? null : found.get(0);
    }

    private static String childText(Element parent, String name) {
        Element child = firstChild(parent, name);
        if (child == null) {
            return null;
        }
        String text = child.getTextContent();
        return text == null || text.isBlank() ? null : text.trim();
    }

    /** Tempo của {@code <sound tempo="...">} đầu tiên trong ô nhịp (có thể nằm sâu trong {@code <direction>}). */
    private static Integer firstTempo(Element measure) {
        NodeList sounds = measure.getElementsByTagName("sound");
        for (int i = 0; i < sounds.getLength(); i++) {
            String value = ((Element) sounds.item(i)).getAttribute("tempo");
            if (!value.isBlank()) {
                try {
                    return (int) Math.round(Double.parseDouble(value.trim()));
                } catch (NumberFormatException e) {
                    return null;
                }
            }
        }
        return null;
    }

    private static Integer intOrNull(String text) {
        if (text == null) {
            return null;
        }
        try {
            return Integer.valueOf(text.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String keyName(Integer fifths, String mode) {
        if (fifths == null || fifths < -7 || fifths > 7) {
            return null;
        }
        return "minor".equalsIgnoreCase(mode) ? MINOR_KEYS[fifths + 7] : MAJOR_KEYS[fifths + 7];
    }
}
