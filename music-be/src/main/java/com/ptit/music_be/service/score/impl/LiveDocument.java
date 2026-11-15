package com.ptit.music_be.service.score.impl;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.utils.MeasureHasher;
import com.ptit.music_be.utils.MusicXmlInspector;

/**
 * Bản MusicXML đang được nhiều người cùng sửa (mục 4.4), giữ trong bộ nhớ. Server là nơi quyết định duy nhất: một thao
 * tác chỉ được nhận khi mã băm của từng ô nó định thay ({@code beforeHash}) còn đúng bằng ô hiện tại, tức người gửi
 * đang nhìn đúng ô như server. Không thì bị từ chối và người gửi tải lại ô đó. Mỗi thao tác được nhận tăng {@link #seq}.
 *
 * <p>Lớp đặt cùng gói với {@link SuggestionDiffer} để dùng lại các hàm đọc ô nhịp và serialize. Mọi hàm công khai đều
 * {@code synchronized}; người gọi không cần tự khóa, nhưng muốn ghi log và phát tin theo đúng thứ tự seq thì phải giữ
 * {@link #lock()} quanh cả chuỗi "áp dụng, ghi, phát".
 */
public final class LiveDocument {

    /** Lý do một thao tác bị từ chối. */
    public enum Reason {
        /** Ô đã bị người khác sửa kể từ lúc người gửi nhìn thấy. */
        CONFLICT,
        /** Thao tác làm đổi khóa/nhịp/divisions... của ô nên ảnh hưởng các ô sau: phải gửi dạng cấu trúc. */
        STRUCTURAL_REQUIRED,
        /** Người gửi chưa nhận đủ các thao tác trước (baseSeq lệch): phải tải lại cả bài. */
        STALE,
        /** Chỉ số ô sai, XML hỏng, ô trùng trong một gói... */
        INVALID
    }

    /** Một ô người dùng muốn thay. */
    public record MeasureEdit(int partIndex, int measureIndex, String beforeHash, String afterXml) {}

    /**
     * Nội dung một ô sau khi áp dụng, hoặc nội dung hiện tại của ô khi bị từ chối, kèm mã băm của server. Client không tự
     * băm: nó dùng lại mã băm server đã báo làm {@code beforeHash} cho lần sửa kế tiếp, nên hai bên không cần chung thuật
     * toán chuẩn hóa.
     */
    public record MeasureXml(int partIndex, int measureIndex, String xml, String hash) {}

    /**
     * Kết quả áp dụng một thao tác.
     *
     * @param applied true nếu đã nhận
     * @param duplicate true nếu {@code opId} đã được nhận trước đó (không làm gì)
     * @param seq seq của thao tác vừa nhận; khi bị từ chối là seq hiện tại của server
     * @param reason lý do từ chối, null nếu nhận
     * @param measures các ô vừa đổi (nhận) hoặc nội dung hiện tại của các ô bị từ chối
     * @param structuralXml toàn bộ MusicXML sau thao tác cấu trúc, null nếu không phải thao tác cấu trúc
     */
    public record Outcome(
            boolean applied,
            boolean duplicate,
            long seq,
            Reason reason,
            List<MeasureXml> measures,
            String structuralXml) {

        static Outcome accepted(long seq, List<MeasureXml> measures, String structuralXml) {
            return new Outcome(true, false, seq, null, measures, structuralXml);
        }

        static Outcome rejected(long seq, Reason reason, List<MeasureXml> current) {
            return new Outcome(false, false, seq, reason, current, null);
        }

        static Outcome duplicateOf(long seq) {
            return new Outcome(false, true, seq, null, List.of(), null);
        }
    }

    private static final int MAX_REMEMBERED_OPS = 2000;
    private static final Set<String> CONTEXT_TAGS = Set.of("divisions", "key", "time", "clef", "staves", "transpose");

    private final Object monitor = new Object();
    private Document dom;
    private List<List<Element>> measures;
    private List<List<String>> hashes;
    private long seq;
    private final long startSeq;
    private long savedSeq;
    private int baseVersion;
    private final Set<String> seenOps = new LinkedHashSet<>();

    private LiveDocument(Document dom, int baseVersion, long startSeq) {
        this.baseVersion = baseVersion;
        this.startSeq = startSeq;
        this.seq = startSeq;
        this.savedSeq = startSeq;
        load(dom);
    }

    /**
     * Mở phiên từ MusicXML đã lưu.
     *
     * @param startSeq seq bắt đầu (seq lớn nhất đã ghi trong DB), để seq không bao giờ dùng lại
     * @throws AppException MUSICXML_INVALID nếu không phải {@code score-partwise}
     */
    public static LiveDocument open(byte[] xml, int baseVersion, long startSeq) {
        return new LiveDocument(MusicXmlInspector.parseStored(xml), baseVersion, startSeq);
    }

    /** Đối tượng khóa để người gọi giữ khi cần "áp dụng, ghi log, phát" liền mạch theo đúng thứ tự seq. */
    public Object lock() {
        return monitor;
    }

    public long seq() {
        synchronized (monitor) {
            return seq;
        }
    }

    /** Seq lúc mở phiên: client có seq nhỏ hơn mức này không phát lại được mà phải tải lại cả bài. */
    public long startSeq() {
        return startSeq;
    }

    public int baseVersion() {
        synchronized (monitor) {
            return baseVersion;
        }
    }

    /** Có thao tác chưa được lưu thành version không. */
    public boolean hasUnsaved() {
        synchronized (monitor) {
            return seq > savedSeq;
        }
    }

    /** Seq của thao tác đầu tiên chưa lưu (để ghi vào meta của version). */
    public long firstUnsavedSeq() {
        synchronized (monitor) {
            return savedSeq + 1;
        }
    }

    /** Ghi nhận đã lưu tới {@code savedTo} thành version {@code version}. */
    public void markSaved(long savedTo, int version) {
        synchronized (monitor) {
            this.savedSeq = savedTo;
            this.baseVersion = version;
        }
    }

    /** Mã băm của mọi ô, theo part rồi theo thứ tự ô: client lưu lại để dùng làm {@code beforeHash}. */
    public List<List<String>> hashes() {
        synchronized (monitor) {
            return hashes.stream().map(List::copyOf).toList();
        }
    }

    /** Số ô của mỗi part, để client kiểm tra khung. */
    public List<Integer> shape() {
        synchronized (monitor) {
            return measures.stream().map(List::size).toList();
        }
    }

    /** MusicXML hiện tại (UTF-8, không DOCTYPE), dùng để lưu thành version hoặc gửi cho người mới vào. */
    public byte[] toBytes() {
        return fullXml().getBytes(StandardCharsets.UTF_8);
    }

    public String fullXml() {
        synchronized (monitor) {
            return SuggestionDiffer.serialize(dom, false);
        }
    }

    /**
     * Áp dụng thao tác thay một số ô.
     *
     * @param opId mã thao tác do client sinh
     * @param edits các ô cần thay, mỗi ô tối đa một lần
     */
    public Outcome applyMeasures(String opId, List<MeasureEdit> edits) {
        synchronized (monitor) {
            if (seenOps.contains(opId)) {
                return Outcome.duplicateOf(seq);
            }
            if (edits.isEmpty() || !allInRangeAndDistinct(edits)) {
                return Outcome.rejected(seq, Reason.INVALID, List.of());
            }
            List<MeasureXml> conflicts = new ArrayList<>();
            for (MeasureEdit edit : edits) {
                if (!hashes.get(edit.partIndex()).get(edit.measureIndex()).equals(edit.beforeHash())) {
                    conflicts.add(current(edit.partIndex(), edit.measureIndex()));
                }
            }
            if (!conflicts.isEmpty()) {
                return Outcome.rejected(seq, Reason.CONFLICT, conflicts);
            }

            List<Element> replacements = new ArrayList<>();
            for (MeasureEdit edit : edits) {
                Element replacement = parseMeasure(edit.afterXml());
                if (replacement == null) {
                    return Outcome.rejected(seq, Reason.INVALID, List.of());
                }
                Element old = measures.get(edit.partIndex()).get(edit.measureIndex());
                if (!contextSignature(old).equals(contextSignature(replacement))) {
                    return Outcome.rejected(seq, Reason.STRUCTURAL_REQUIRED, List.of());
                }
                replacements.add(replacement);
            }

            List<MeasureXml> applied = new ArrayList<>();
            for (int i = 0; i < edits.size(); i++) {
                MeasureEdit edit = edits.get(i);
                Element old = measures.get(edit.partIndex()).get(edit.measureIndex());
                Node imported = dom.importNode(replacements.get(i), true);
                old.getParentNode().replaceChild(imported, old);
                Element now = (Element) imported;
                measures.get(edit.partIndex()).set(edit.measureIndex(), now);
                hashes.get(edit.partIndex()).set(edit.measureIndex(), MeasureHasher.hash(now));
                applied.add(current(edit.partIndex(), edit.measureIndex()));
            }
            seq += 1;
            remember(opId);
            return Outcome.accepted(seq, applied, null);
        }
    }

    /**
     * Áp dụng thao tác cấu trúc (đổi khóa, nhịp, thêm/xóa ô, thêm part, sửa tiêu đề): thay cả bài. Người gửi phải đã
     * nhận mọi thao tác trước đó ({@code baseSeq == seq}) và giữ khóa cả bài, nên không cần so mã băm từng ô.
     */
    public Outcome applyStructural(String opId, long baseSeq, String xml) {
        synchronized (monitor) {
            if (seenOps.contains(opId)) {
                return Outcome.duplicateOf(seq);
            }
            if (baseSeq != seq) {
                return Outcome.rejected(seq, Reason.STALE, List.of());
            }
            Document parsed;
            try {
                parsed = MusicXmlInspector.parseSecure(xml.getBytes(StandardCharsets.UTF_8));
                if (SuggestionDiffer.measuresOf(parsed).stream().anyMatch(List::isEmpty)
                        || SuggestionDiffer.measuresOf(parsed).isEmpty()) {
                    return Outcome.rejected(seq, Reason.INVALID, List.of());
                }
            } catch (AppException e) {
                return Outcome.rejected(seq, Reason.INVALID, List.of());
            }
            load(parsed);
            seq += 1;
            remember(opId);
            return Outcome.accepted(seq, List.of(), SuggestionDiffer.serialize(dom, false));
        }
    }

    /** Nội dung hiện tại của một ô, hoặc null nếu chỉ số sai. */
    public MeasureXml measure(int partIndex, int measureIndex) {
        synchronized (monitor) {
            if (partIndex < 0 || partIndex >= measures.size()) {
                return null;
            }
            if (measureIndex < 0 || measureIndex >= measures.get(partIndex).size()) {
                return null;
            }
            return current(partIndex, measureIndex);
        }
    }

    // ---------------------------------------------------------------- nội bộ (gọi khi đã giữ monitor)

    private void load(Document document) {
        this.dom = document;
        this.measures = new ArrayList<>();
        this.hashes = new ArrayList<>();
        for (List<Element> part : SuggestionDiffer.measuresOf(document)) {
            List<Element> elements = new ArrayList<>(part);
            List<String> partHashes = new ArrayList<>();
            elements.forEach(measure -> partHashes.add(MeasureHasher.hash(measure)));
            measures.add(elements);
            hashes.add(partHashes);
        }
    }

    private MeasureXml current(int partIndex, int measureIndex) {
        return new MeasureXml(
                partIndex,
                measureIndex,
                SuggestionDiffer.serialize(measures.get(partIndex).get(measureIndex), true),
                hashes.get(partIndex).get(measureIndex));
    }

    private boolean allInRangeAndDistinct(List<MeasureEdit> edits) {
        Set<Long> seen = new HashSet<>();
        for (MeasureEdit edit : edits) {
            int p = edit.partIndex();
            int i = edit.measureIndex();
            if (p < 0 || p >= measures.size() || i < 0 || i >= measures.get(p).size()) {
                return false;
            }
            if (edit.beforeHash() == null || edit.afterXml() == null || !seen.add(((long) p << 32) | i)) {
                return false;
            }
        }
        return true;
    }

    /** Phân tích XML của một ô; null nếu hỏng hoặc gốc không phải {@code <measure>}. */
    private static Element parseMeasure(String xml) {
        try {
            Element root = MusicXmlInspector.parseStored(xml.getBytes(StandardCharsets.UTF_8))
                    .getDocumentElement();
            return root != null && "measure".equals(root.getTagName()) ? root : null;
        } catch (AppException e) {
            return null;
        }
    }

    /**
     * Chữ ký các khai báo làm đổi cách đọc những ô phía sau ({@code divisions}, khóa nhạc, nhịp, ...). Hai ô cùng chữ ký
     * thì thay ô này bằng ô kia không ảnh hưởng ô nào khác.
     */
    private static String contextSignature(Element measure) {
        StringBuilder out = new StringBuilder();
        for (Element attributes : MusicXmlInspector.childElements(measure, "attributes")) {
            NodeList children = attributes.getChildNodes();
            for (int i = 0; i < children.getLength(); i++) {
                if (children.item(i) instanceof Element child && CONTEXT_TAGS.contains(child.getTagName())) {
                    out.append(MeasureHasher.hashElement(child)).append('|');
                }
            }
        }
        return out.toString();
    }

    private void remember(String opId) {
        seenOps.add(opId);
        if (seenOps.size() > MAX_REMEMBERED_OPS) {
            seenOps.remove(seenOps.iterator().next());
        }
    }
}
