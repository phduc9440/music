package com.ptit.music_be.configuration;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import com.ptit.music_be.dto.enums.ai.ProcessingStatus;
import com.ptit.music_be.dto.enums.score.FileType;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.repository.score.ScoreFileRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.service.storage.FileStorageService;
import com.ptit.music_be.utils.MusicXmlInspector;
import com.ptit.music_be.utils.MusicXmlSummary;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Bản nhạc mẫu (seed V6) chỉ có dòng trong DB, không kèm file, nên trang chi tiết khóa Chỉnh sửa / Phát / Luyện tập /
 * Gợi ý hợp âm. SQL không ghi được file lên đĩa, nên lúc khởi động bước này ghi MusicXML cho mọi bản đã xử lý xong
 * ({@code COMPLETED}) mà chưa có MusicXML ({@code current_version = 0}), giống hệt luồng tạo bản trống: file
 * {@code scores/{id}/musicxml/v1.musicxml}, dòng {@code score_files}, {@code current_version = 1} và metadata đọc từ file.
 *
 * <p>Nội dung lấy từ {@code classpath:seed/musicxml}: bài quen thuộc có đoạn mở đầu đúng giai điệu (piano hai khuông),
 * bài còn lại dùng bài tập gam và hợp âm. Tên bài và tác giả trong file được thay bằng của bản nhạc. Chạy lại không làm
 * gì với bản đã có MusicXML (bản người dùng tải lên luôn có). Tắt bằng {@code app.seed.musicxml.enabled=false} (test tắt).
 */
@Component
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(prefix = "app.seed.musicxml", name = "enabled", havingValue = "true", matchIfMissing = true)
public class SeedMusicXmlInitializer implements ApplicationRunner {

    static final String RESOURCE_DIR = "seed/musicxml/";
    static final String FALLBACK = "practice-scale";
    static final String CONTENT_TYPE = "application/vnd.recordare.musicxml+xml";

    /** Đầu tên bài (chữ thường, bỏ dấu) → file trong {@link #RESOURCE_DIR}; theo thứ tự, khớp cái đầu tiên. */
    static final Map<String, String> PIECES = new LinkedHashMap<>();

    static {
        PIECES.put("fur elise", "fur-elise");
        PIECES.put("ode to joy", "ode-to-joy");
        PIECES.put("twinkle", "twinkle");
        PIECES.put("happy birthday", "happy-birthday");
        PIECES.put("jingle bells", "jingle-bells");
        PIECES.put("moonlight sonata", "moonlight-sonata");
        PIECES.put("turkish march", "turkish-march");
        PIECES.put("canon in d", "canon-in-d");
        PIECES.put("minuet in g", "minuet-in-g");
        PIECES.put("prelude in c", "prelude-in-c");
        PIECES.put("eine kleine nachtmusik", "eine-kleine-nachtmusik");
        PIECES.put("gymnopedie no. 1", "gymnopedie");
        PIECES.put("spring (four seasons)", "spring");
        PIECES.put("hallelujah", "hallelujah");
        PIECES.put("invention no. 1", "invention-1");
    }

    private final ScoreRepository scoreRepository;
    private final ScoreFileRepository scoreFileRepository;
    private final FileStorageService fileStorageService;
    private final TransactionTemplate transactionTemplate;

    @Override
    public void run(ApplicationArguments args) {
        List<String> ids = scoreRepository.findAll().stream()
                .filter(SeedMusicXmlInitializer::needsMusicXml)
                .map(Score::getId)
                .toList();
        int written = 0;
        for (String id : ids) {
            try {
                Boolean done = transactionTemplate.execute(status -> seed(id));
                if (Boolean.TRUE.equals(done)) {
                    written++;
                }
            } catch (RuntimeException e) {
                log.warn("Không ghi được MusicXML mẫu cho bản nhạc {}: {}", id, e.getMessage());
            }
        }
        if (written > 0) {
            log.info("Đã ghi MusicXML mẫu cho {} bản nhạc seed", written);
        }
    }

    static boolean needsMusicXml(Score score) {
        return ProcessingStatus.COMPLETED.name().equals(score.getProcessingStatus())
                && (score.getCurrentVersion() == null || score.getCurrentVersion() == 0);
    }

    private boolean seed(String scoreId) {
        Score score = scoreRepository.findById(scoreId).orElse(null);
        if (score == null
                || !needsMusicXml(score)
                || !scoreFileRepository
                        .findByScoreIdAndFileTypeOrderByPageNumberAsc(scoreId, FileType.MUSICXML)
                        .isEmpty()) {
            return false;
        }
        byte[] xml = withTitle(load(resourceFor(score.getTitle())), score.getTitle(), score.getComposer());
        MusicXmlSummary summary = MusicXmlInspector.inspect(xml);

        String storagePath = "scores/%s/musicxml/v1.musicxml".formatted(scoreId);
        fileStorageService.store(new ByteArrayInputStream(xml), storagePath);
        scoreFileRepository.save(ScoreFile.builder()
                .score(score)
                .fileType(FileType.MUSICXML)
                .originalFileName("v1.musicxml")
                .storagePath(storagePath)
                .contentType(CONTENT_TYPE)
                .sizeBytes((long) xml.length)
                .version(1)
                .isCurrent(true)
                .meta("{\"measureCount\":%d,\"seeded\":true}".formatted(summary.measureCount()))
                .build());
        score.setCurrentVersion(1);
        score.setMeasureCount(summary.measureCount());
        score.setKeySignature(summary.keySignature());
        score.setTimeSignature(summary.timeSignature());
        score.setTempoBpm(summary.tempoBpm());
        score.setStaffCount(summary.staffCount());
        scoreRepository.save(score);
        return true;
    }

    /** Tên file mẫu cho một tên bài: so đầu tên đã bỏ dấu, không có thì dùng bài tập gam. */
    static String resourceFor(String title) {
        String key = normalize(title);
        return PIECES.entrySet().stream()
                .filter(e -> key.startsWith(e.getKey()))
                .map(Map.Entry::getValue)
                .findFirst()
                .orElse(FALLBACK);
    }

    static String normalize(String text) {
        String plain = Normalizer.normalize(text == null ? "" : text, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");
        return plain.toLowerCase(Locale.ROOT).strip();
    }

    /** Thay tên bài và tác giả trong file bằng của bản nhạc (để bài tập gam dùng chung vẫn mang đúng tên bài). */
    static byte[] withTitle(byte[] xml, String title, String composer) {
        String text = new String(xml, StandardCharsets.UTF_8);
        text = text.replaceFirst(
                "<work-title>[^<]*</work-title>",
                Matcher.quoteReplacement("<work-title>" + xmlEscape(title) + "</work-title>"));
        text = text.replaceFirst(
                "<creator type=\"composer\">[^<]*</creator>",
                Matcher.quoteReplacement("<creator type=\"composer\">" + xmlEscape(composer) + "</creator>"));
        return text.getBytes(StandardCharsets.UTF_8);
    }

    static String xmlEscape(String text) {
        return text == null
                ? ""
                : text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private static byte[] load(String name) {
        try (InputStream in = new ClassPathResource(RESOURCE_DIR + name + ".musicxml").getInputStream()) {
            return in.readAllBytes();
        } catch (IOException e) {
            throw new IllegalStateException("Thiếu file MusicXML mẫu " + name, e);
        }
    }
}
