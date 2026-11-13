package com.ptit.music_be.service.score.impl;

import java.io.StringWriter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;
import javax.xml.XMLConstants;
import javax.xml.transform.OutputKeys;
import javax.xml.transform.Transformer;
import javax.xml.transform.TransformerException;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.utils.MeasureHasher;
import com.ptit.music_be.utils.MusicXmlInspector;

/**
 * So sánh hai bản MusicXML theo từng ô nhịp để tạo đề xuất sửa (mục 4.3). Hàm thuần, không đọc DB hay file.
 *
 * <p>Đề xuất chỉ chia được thành các thay đổi theo ô khi hai bản có cùng <b>khung</b> (danh sách part, số ô mỗi part),
 * cùng <b>phần đầu</b> ({@code <work>}, {@code <movement-title>}, {@code <part-list>}) và cùng <b>ngữ cảnh</b> tại đầu mọi
 * ô (giá trị đang hiệu lực của {@code divisions}, {@code key}, {@code time}, {@code clef}, {@code staves},
 * {@code transpose}). Khác ở bất kỳ điểm nào thì đề xuất là <i>structural</i>: không có danh sách ô, chỉ nhận được tất cả.
 */
final class SuggestionDiffer {

    /** Các phần tử con của {@code <score-partwise>} tạo nên phần đầu. */
    private static final List<String> HEADER_TAGS = List.of("work", "movement-title", "part-list");

    /** Các phần tử trong {@code <attributes>} làm đổi cách đọc những ô phía sau. */
    private static final Set<String> CONTEXT_TAGS = Set.of("divisions", "key", "time", "clef", "staves", "transpose");

    private SuggestionDiffer() {}

    /** Khung của một bản: id từng part và số ô mỗi part, cùng thứ tự. */
    record Shape(List<String> parts, List<Integer> measures) {}

    /**
     * Một ô khác nhau.
     *
     * @param partIndex thứ tự part, từ 0
     * @param measureIndex thứ tự ô trong part, từ 0
     * @param measureNumber thuộc tính {@code number} của ô đề xuất, để hiển thị
     * @param baseHash {@link MeasureHasher#hash} của ô ở bản gốc
     * @param contextHash ngữ cảnh hiệu lực tại đầu ô (xem {@link #contextHashes})
     * @param proposedXml phần tử {@code <measure>} của bản đề xuất, đã serialize
     */
    record MeasureChange(
            int partIndex,
            int measureIndex,
            String measureNumber,
            String baseHash,
            String contextHash,
            String proposedXml) {}

    /** Kết quả so sánh; {@code changes} rỗng khi {@code structural}. */
    record Result(boolean structural, Shape baseShape, List<MeasureChange> changes) {}

    /**
     * So sánh bản đề xuất với bản gốc.
     *
     * @throws AppException MUSICXML_INVALID khi một trong hai không phải {@code score-partwise}
     */
    static Result diff(Document base, Document proposed) {
        List<List<Element>> baseMeasures = measuresOf(base);
        List<List<Element>> proposedMeasures = measuresOf(proposed);
        Shape baseShape = shapeOf(base);
        List<List<String>> baseContexts = contextHashes(baseMeasures);

        boolean structural = !baseShape.equals(shapeOf(proposed))
                || !headerKey(base).equals(headerKey(proposed))
                || !baseContexts.equals(contextHashes(proposedMeasures));
        if (structural) {
            return new Result(true, baseShape, List.of());
        }

        List<MeasureChange> changes = new ArrayList<>();
        for (int p = 0; p < baseMeasures.size(); p++) {
            for (int i = 0; i < baseMeasures.get(p).size(); i++) {
                String baseHash = MeasureHasher.hash(baseMeasures.get(p).get(i));
                Element proposedMeasure = proposedMeasures.get(p).get(i);
                if (!baseHash.equals(MeasureHasher.hash(proposedMeasure))) {
                    changes.add(new MeasureChange(
                            p,
                            i,
                            proposedMeasure.getAttribute("number"),
                            baseHash,
                            baseContexts.get(p).get(i),
                            serialize(proposedMeasure, true)));
                }
            }
        }
        return new Result(false, baseShape, changes);
    }

    /** Khung của bản nhạc. */
    static Shape shapeOf(Document document) {
        List<String> ids = new ArrayList<>();
        List<Integer> counts = new ArrayList<>();
        for (Element part : partsOf(document)) {
            ids.add(part.getAttribute("id"));
            counts.add(MusicXmlInspector.childElements(part, "measure").size());
        }
        return new Shape(ids, counts);
    }

    /** Các {@code <measure>} của từng {@code <part>}, theo thứ tự trong tài liệu. */
    static List<List<Element>> measuresOf(Document document) {
        List<List<Element>> result = new ArrayList<>();
        for (Element part : partsOf(document)) {
            result.add(MusicXmlInspector.childElements(part, "measure"));
        }
        return result;
    }

    /**
     * Mã ngữ cảnh tại đầu từng ô (trước khi áp các {@code <attributes>} của chính ô đó) cho mỗi part. Hai bản có cùng mã
     * thì mọi ô được đọc với cùng divisions, khóa, nhịp, khóa nhạc; thay một ô của bản này bằng ô của bản kia là an toàn.
     */
    static List<List<String>> contextHashes(List<List<Element>> measuresByPart) {
        List<List<String>> result = new ArrayList<>();
        for (List<Element> measures : measuresByPart) {
            Map<String, String> state = new TreeMap<>();
            List<String> hashes = new ArrayList<>();
            for (Element measure : measures) {
                hashes.add(digest(state));
                for (Element attributes : MusicXmlInspector.childElements(measure, "attributes")) {
                    applyAttributes(state, attributes);
                }
            }
            result.add(hashes);
        }
        return result;
    }

    /**
     * Tên hiển thị của từng part: id → {@code <part-name>} trong {@code <part-list>}. Part không có tên thì không có
     * trong kết quả.
     */
    static Map<String, String> partNames(Document document) {
        Map<String, String> names = new HashMap<>();
        Element root = document.getDocumentElement();
        for (Element partList : MusicXmlInspector.childElements(root, "part-list")) {
            for (Element scorePart : MusicXmlInspector.childElements(partList, "score-part")) {
                List<Element> name = MusicXmlInspector.childElements(scorePart, "part-name");
                if (!name.isEmpty() && !name.get(0).getTextContent().isBlank()) {
                    names.put(
                            scorePart.getAttribute("id"),
                            name.get(0).getTextContent().trim());
                }
            }
        }
        return names;
    }

    /**
     * Serialize một nút ra UTF-8 để lưu hoặc đọc lại bằng {@link MusicXmlInspector#parseStored}. Không bao giờ ghi
     * DOCTYPE (MusicXML lưu từ Editor không có DOCTYPE).
     *
     * @param omitXmlDeclaration {@code true} để bỏ dòng {@code <?xml ...?>} (khi chỉ serialize một phần tử)
     */
    static String serialize(Node node, boolean omitXmlDeclaration) {
        try {
            TransformerFactory factory = TransformerFactory.newInstance();
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            Transformer transformer = factory.newTransformer();
            transformer.setOutputProperty(OutputKeys.OMIT_XML_DECLARATION, omitXmlDeclaration ? "yes" : "no");
            transformer.setOutputProperty(OutputKeys.ENCODING, "UTF-8");
            StringWriter writer = new StringWriter();
            transformer.transform(new DOMSource(node), new StreamResult(writer));
            return writer.toString();
        } catch (TransformerException e) {
            throw new AppException(ErrorCode.MUSICXML_INVALID);
        }
    }

    // ---------------------------------------------------------------- nội bộ

    private static List<Element> partsOf(Document document) {
        Element root = document.getDocumentElement();
        if (root == null || !"score-partwise".equals(root.getTagName())) {
            throw new AppException(ErrorCode.MUSICXML_INVALID);
        }
        return MusicXmlInspector.childElements(root, "part");
    }

    /** Mã phần đầu: băm từng phần tử trong {@link #HEADER_TAGS}, nối theo thứ tự cố định. */
    private static String headerKey(Document document) {
        Element root = document.getDocumentElement();
        List<String> hashes = new ArrayList<>();
        for (String tag : HEADER_TAGS) {
            for (Element element : MusicXmlInspector.childElements(root, tag)) {
                hashes.add(tag + ":" + MeasureHasher.hashElement(element));
            }
        }
        return String.join("|", hashes);
    }

    private static void applyAttributes(Map<String, String> state, Element attributes) {
        NodeList children = attributes.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            Node node = children.item(i);
            if (node instanceof Element child && CONTEXT_TAGS.contains(child.getTagName())) {
                // number: khuông áp dụng (clef, key, time có thể khai báo riêng từng khuông)
                state.put(child.getTagName() + "#" + child.getAttribute("number"), MeasureHasher.hashElement(child));
            }
        }
    }

    private static String digest(Map<String, String> state) {
        return MeasureHasher.sha256Hex(state.entrySet().stream()
                .map(entry -> entry.getKey() + "=" + entry.getValue())
                .collect(Collectors.joining("\n")));
    }
}
