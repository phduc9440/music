package com.ptit.music_be.service.impl;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;

import com.ptit.music_be.dto.enums.FileType;
import com.ptit.music_be.dto.enums.ProcessingStatus;
import com.ptit.music_be.dto.enums.ScoreSource;
import com.ptit.music_be.dto.response.ScoreImportResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.mapper.ScoreFileMapper;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.ScoreFileRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.FileStorageService;
import com.ptit.music_be.service.ScoreImportService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Slf4j
public class ScoreImportServiceImpl implements ScoreImportService {

    static final int MAX_TITLE_LENGTH = 255;
    static final int MAX_COMPOSER_LENGTH = 255;
    /** Giới hạn dung lượng XML sau khi giải nén (chống zip bomb). */
    static final int MAX_XML_BYTES = 50 * 1024 * 1024;

    MemberRepository memberRepository;
    ScoreRepository scoreRepository;
    ScoreFileRepository scoreFileRepository;
    FileStorageService fileStorageService;
    ScoreFileMapper scoreFileMapper;

    enum ImportKind {
        MUSICXML("musicxml", "application/vnd.recordare.musicxml+xml"),
        XML("xml", "application/xml"),
        MXL("mxl", "application/vnd.recordare.musicxml"),
        MIDI("mid", "audio/midi");

        final String extension;
        final String contentType;

        ImportKind(String extension, String contentType) {
            this.extension = extension;
            this.contentType = contentType;
        }

        boolean isMidi() {
            return this == MIDI;
        }
    }

    /** Thông tin đọc được từ MusicXML. */
    record MusicXmlInfo(
            String title,
            String composer,
            Integer measureCount,
            String timeSignature,
            Integer staffCount,
            Integer tempoBpm,
            String keySignature) {}

    /** Tonic theo số dấu hóa (fifths) từ -7 đến 7: chỉ số = fifths + 7. */
    static final String[] MAJOR_KEYS = {
        "Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"
    };

    static final String[] MINOR_KEYS = {
        "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#", "G#", "D#", "A#"
    };

    @Override
    @Transactional
    public ScoreImportResponse importScore(MultipartFile file, String title, String composer) {
        String cleanComposer = trimToLength(composer, MAX_COMPOSER_LENGTH, ErrorCode.SCORE_COMPOSER_INVALID);
        String cleanTitle = trimToLength(title, MAX_TITLE_LENGTH, ErrorCode.SCORE_TITLE_INVALID);

        if (file == null || file.isEmpty()) {
            throw new AppException(ErrorCode.FILE_EMPTY);
        }
        ImportKind kind = kindFromExtension(file.getOriginalFilename());
        if (kind == null) {
            throw new AppException(ErrorCode.IMPORT_TYPE_NOT_SUPPORTED);
        }

        byte[] data;
        try {
            data = file.getBytes();
        } catch (IOException e) {
            log.error("Cannot read uploaded file {}", file.getOriginalFilename(), e);
            throw new AppException(ErrorCode.FILE_STORAGE_ERROR);
        }

        // Nội dung thật phải khớp với đuôi file, rồi mới parse
        byte[] xmlBytes = null;
        MusicXmlInfo info = null;
        if (kind.isMidi()) {
            validateMidi(data);
        } else {
            xmlBytes = kind == ImportKind.MXL ? extractMxl(data) : data;
            info = parseMusicXml(xmlBytes);
        }

        Member member = memberRepository
                .findByEmail(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));

        String resolvedTitle = resolveTitle(cleanTitle, info, file.getOriginalFilename());
        String resolvedComposer = cleanComposer != null ? cleanComposer : cap(info == null ? null : info.composer());

        Score score = scoreRepository.save(Score.builder()
                .member(member)
                .title(resolvedTitle)
                .composer(resolvedComposer)
                .visibility("PRIVATE")
                .isOfficial(false)
                .processingStatus(ProcessingStatus.COMPLETED.name())
                .sourceType(ScoreSource.IMPORT.name())
                .measureCount(info == null ? null : info.measureCount())
                .timeSignature(info == null ? null : info.timeSignature())
                .tempoBpm(info == null ? null : info.tempoBpm())
                .keySignature(info == null ? null : info.keySignature())
                .staffCount(info == null || info.staffCount() == null ? 2 : info.staffCount())
                .currentVersion(kind.isMidi() ? 0 : 1)
                .build());

        String scoreDir = "scores/" + score.getId();
        // Nếu bước nào bên dưới lỗi thì DB rollback -> xóa luôn file đã ghi ra đĩa
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == STATUS_ROLLED_BACK) {
                    fileStorageService.deleteDirectory(scoreDir);
                }
            }
        });

        List<ScoreFile> saved = new ArrayList<>();
        String originalName = cleanFileName(file.getOriginalFilename());
        String originalPath = String.format("%s/original/01-%s.%s", scoreDir, UUID.randomUUID(), kind.extension);
        saved.add(saveFile(
                score,
                kind.isMidi() ? FileType.ORIGINAL_MIDI : FileType.ORIGINAL_MUSICXML,
                originalName,
                originalPath,
                kind.contentType,
                data));

        if (!kind.isMidi()) {
            // Bản MusicXML thuần (đã giải nén nếu là .mxl): đây là bản hiện hành mà Viewer/Editor sẽ đọc
            String xmlPath = String.format("%s/musicxml/v1.musicxml", scoreDir);
            saved.add(saveFile(
                    score,
                    FileType.MUSICXML,
                    StringUtils.stripFilenameExtension(originalName) + ".musicxml",
                    xmlPath,
                    ImportKind.MUSICXML.contentType,
                    xmlBytes));
        }

        return ScoreImportResponse.builder()
                .scoreId(score.getId())
                .title(score.getTitle())
                .composer(score.getComposer())
                .processingStatus(score.getProcessingStatus())
                .files(scoreFileMapper.toResponses(saved))
                .build();
    }

    private ScoreFile saveFile(
            Score score, FileType type, String originalName, String path, String contentType, byte[] content) {
        String storedPath;
        try (InputStream in = new ByteArrayInputStream(content)) {
            storedPath = fileStorageService.store(in, path);
        } catch (IOException e) {
            throw new AppException(ErrorCode.FILE_STORAGE_ERROR);
        }
        return scoreFileRepository.save(ScoreFile.builder()
                .score(score)
                .fileType(type)
                .originalFileName(originalName)
                .storagePath(storedPath)
                .contentType(contentType)
                .sizeBytes((long) content.length)
                .build());
    }

    // ---------------------------------------------------------------- validation

    private ImportKind kindFromExtension(String fileName) {
        String ext = StringUtils.getFilenameExtension(fileName);
        if (ext == null) {
            return null;
        }
        return switch (ext.toLowerCase(Locale.ROOT)) {
            case "musicxml" -> ImportKind.MUSICXML;
            case "xml" -> ImportKind.XML;
            case "mxl" -> ImportKind.MXL;
            case "mid", "midi" -> ImportKind.MIDI;
            default -> null;
        };
    }

    /** MIDI hợp lệ: bắt đầu bằng chunk "MThd" dài 6, format 0-2, ít nhất 1 track. */
    private void validateMidi(byte[] d) {
        boolean ok = d.length >= 14
                && d[0] == 'M'
                && d[1] == 'T'
                && d[2] == 'h'
                && d[3] == 'd'
                && d[4] == 0
                && d[5] == 0
                && d[6] == 0
                && d[7] == 6
                && ((d[8] & 0xFF) << 8 | (d[9] & 0xFF)) <= 2
                && ((d[10] & 0xFF) << 8 | (d[11] & 0xFF)) >= 1;
        if (!ok) {
            throw new AppException(ErrorCode.MIDI_INVALID);
        }
    }

    /** .mxl là file ZIP: đọc META-INF/container.xml để biết file MusicXML chính nằm ở đâu rồi giải nén riêng file đó. */
    private byte[] extractMxl(byte[] zip) {
        if (zip.length < 4 || zip[0] != 'P' || zip[1] != 'K') {
            throw new AppException(ErrorCode.MUSICXML_FILE_INVALID);
        }
        byte[] container = readZipEntry(zip, "META-INF/container.xml");
        if (container == null) {
            throw new AppException(ErrorCode.MUSICXML_FILE_INVALID);
        }
        Document doc = parseXml(container);
        NodeList rootfiles = doc.getElementsByTagName("rootfile");
        String mainPath = null;
        for (int i = 0; i < rootfiles.getLength() && mainPath == null; i++) {
            String p = ((Element) rootfiles.item(i)).getAttribute("full-path");
            if (StringUtils.hasText(p)) {
                mainPath = p;
            }
        }
        byte[] main = mainPath == null ? null : readZipEntry(zip, mainPath);
        if (main == null) {
            throw new AppException(ErrorCode.MUSICXML_FILE_INVALID);
        }
        return main;
    }

    /** Đọc một entry trong bộ nhớ (không ghi ra đĩa nên không lo path traversal), có giới hạn dung lượng. */
    private byte[] readZipEntry(byte[] zip, String name) {
        try (ZipInputStream in = new ZipInputStream(new ByteArrayInputStream(zip))) {
            ZipEntry entry;
            while ((entry = in.getNextEntry()) != null) {
                if (!entry.isDirectory() && entry.getName().equals(name)) {
                    byte[] content = in.readNBytes(MAX_XML_BYTES + 1);
                    if (content.length > MAX_XML_BYTES) {
                        throw new AppException(ErrorCode.MUSICXML_FILE_INVALID);
                    }
                    return content;
                }
            }
            return null;
        } catch (IOException e) {
            throw new AppException(ErrorCode.MUSICXML_FILE_INVALID);
        }
    }

    private Document parseXml(byte[] xml) {
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            // MuseScore/Finale xuất kèm <!DOCTYPE>, nên không cấm DOCTYPE mà chỉ chặn thực thể/DTD bên ngoài (XXE)
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
            factory.setXIncludeAware(false);
            factory.setExpandEntityReferences(false);
            DocumentBuilder builder = factory.newDocumentBuilder();
            builder.setEntityResolver((publicId, systemId) -> new InputSource(new java.io.StringReader("")));
            return builder.parse(new ByteArrayInputStream(xml));
        } catch (ParserConfigurationException | SAXException | IOException | IllegalArgumentException e) {
            log.warn("Cannot parse MusicXML: {}", e.getMessage());
            throw new AppException(ErrorCode.MUSICXML_FILE_INVALID);
        }
    }

    private MusicXmlInfo parseMusicXml(byte[] xml) {
        Element root = parseXml(xml).getDocumentElement();
        String rootName = root.getTagName();
        if (!rootName.equals("score-partwise") && !rootName.equals("score-timewise")) {
            throw new AppException(ErrorCode.MUSICXML_FILE_INVALID);
        }

        String title = firstText(root, "work-title");
        if (title == null) {
            title = firstText(root, "movement-title");
        }

        String composer = null;
        NodeList creators = root.getElementsByTagName("creator");
        for (int i = 0; i < creators.getLength() && composer == null; i++) {
            Element creator = (Element) creators.item(i);
            if ("composer".equals(creator.getAttribute("type")) && StringUtils.hasText(creator.getTextContent())) {
                composer = creator.getTextContent().trim();
            }
        }

        Integer measures = null;
        Integer staves = 1;
        if (rootName.equals("score-partwise")) {
            NodeList parts = root.getElementsByTagName("part");
            if (parts.getLength() > 0) {
                measures = countChildren(parts.item(0), "measure");
            }
        }
        String stavesText = firstText(root, "staves");
        if (stavesText != null) {
            try {
                staves = Math.max(1, Integer.parseInt(stavesText));
            } catch (NumberFormatException ignored) {
                // giữ mặc định 1
            }
        }

        String beats = firstText(root, "beats");
        String beatType = firstText(root, "beat-type");
        String time = beats != null && beatType != null ? beats + "/" + beatType : null;

        return new MusicXmlInfo(
                title,
                composer,
                measures,
                time == null || time.length() > 8 ? null : time,
                staves,
                readTempo(root),
                readKeySignature(root));
    }

    /** Tempo: ưu tiên thuộc tính tempo của &lt;sound&gt;, không có thì lấy &lt;per-minute&gt; của &lt;metronome&gt;. */
    private Integer readTempo(Element root) {
        NodeList sounds = root.getElementsByTagName("sound");
        for (int i = 0; i < sounds.getLength(); i++) {
            Integer bpm = toBpm(((Element) sounds.item(i)).getAttribute("tempo"));
            if (bpm != null) {
                return bpm;
            }
        }
        return toBpm(firstText(root, "per-minute"));
    }

    private Integer toBpm(String text) {
        if (!StringUtils.hasText(text)) {
            return null;
        }
        try {
            long bpm = Math.round(Double.parseDouble(text.trim()));
            return bpm >= 1 && bpm <= 999 ? (int) bpm : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** Khóa nhạc từ &lt;key&gt; đầu tiên: số dấu hóa + mode -> "C", "Bb", "F#m"... Null nếu không có hoặc không hợp lệ. */
    private String readKeySignature(Element root) {
        NodeList keys = root.getElementsByTagName("key");
        if (keys.getLength() == 0) {
            return null;
        }
        Element key = (Element) keys.item(0);
        String fifthsText = firstText(key, "fifths");
        if (fifthsText == null) {
            return null;
        }
        int fifths;
        try {
            fifths = Integer.parseInt(fifthsText);
        } catch (NumberFormatException e) {
            return null;
        }
        if (fifths < -7 || fifths > 7) {
            return null;
        }
        String mode = firstText(key, "mode");
        boolean minor = mode != null && mode.equalsIgnoreCase("minor");
        return minor ? MINOR_KEYS[fifths + 7] + "m" : MAJOR_KEYS[fifths + 7];
    }

    private String firstText(Element root, String tag) {
        NodeList list = root.getElementsByTagName(tag);
        if (list.getLength() == 0) {
            return null;
        }
        String text = list.item(0).getTextContent();
        return StringUtils.hasText(text) ? text.trim() : null;
    }

    private int countChildren(Node parent, String tag) {
        int n = 0;
        for (Node c = parent.getFirstChild(); c != null; c = c.getNextSibling()) {
            if (c.getNodeType() == Node.ELEMENT_NODE && tag.equals(c.getNodeName())) {
                n++;
            }
        }
        return n;
    }

    // ---------------------------------------------------------------- helpers

    private String trimToLength(String value, int max, ErrorCode error) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.length() > max) {
            throw new AppException(error);
        }
        return trimmed;
    }

    private String cap(String value) {
        return value == null
                ? null
                : value.length() > MAX_COMPOSER_LENGTH ? value.substring(0, MAX_COMPOSER_LENGTH) : value;
    }

    private String resolveTitle(String given, MusicXmlInfo info, String originalFileName) {
        String resolved = given;
        if (resolved == null && info != null) {
            resolved = info.title();
        }
        if (!StringUtils.hasText(resolved)) {
            resolved = StringUtils.stripFilenameExtension(cleanFileName(originalFileName));
        }
        if (!StringUtils.hasText(resolved)) {
            resolved = "Untitled score";
        }
        return resolved.length() > MAX_TITLE_LENGTH ? resolved.substring(0, MAX_TITLE_LENGTH) : resolved;
    }

    private String cleanFileName(String originalFileName) {
        if (originalFileName == null) {
            return "";
        }
        String name = StringUtils.getFilename(StringUtils.cleanPath(originalFileName));
        if (name == null) {
            return "";
        }
        return name.length() > MAX_TITLE_LENGTH ? name.substring(name.length() - MAX_TITLE_LENGTH) : name;
    }
}
