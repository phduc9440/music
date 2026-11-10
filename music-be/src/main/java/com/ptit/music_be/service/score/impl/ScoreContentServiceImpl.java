package com.ptit.music_be.service.impl;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;

import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClientException;

import com.ptit.music_be.client.AiServiceClient;
import com.ptit.music_be.dto.enums.FileType;
import com.ptit.music_be.dto.response.ScoreContent;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.ScoreFileRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.FileStorageService;
import com.ptit.music_be.service.ScoreContentService;
import com.ptit.music_be.service.ScoreFileService;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Slf4j
public class ScoreContentServiceImpl implements ScoreContentService {

    /** Tempo dùng khi bản nhạc chưa có tempo_bpm (đặc tả mục 2.4: không có thì 100). */
    static final int DEFAULT_TEMPO_BPM = 100;

    /** Số ổ khóa chặn sinh lại MIDI trùng; chọn khóa theo hash scoreId nên bộ nhớ không tăng theo số bản nhạc. */
    static final int LOCK_STRIPES = 64;

    ScoreRepository scoreRepository;
    ScoreFileRepository scoreFileRepository;
    ScoreFileService scoreFileService;
    FileStorageService fileStorageService;
    AiServiceClient aiServiceClient;
    PlatformTransactionManager transactionManager;
    ReentrantLock[] midiLocks = createLocks();

    private static ReentrantLock[] createLocks() {
        ReentrantLock[] locks = new ReentrantLock[LOCK_STRIPES];
        for (int i = 0; i < locks.length; i++) {
            locks[i] = new ReentrantLock();
        }
        return locks;
    }

    @Override
    @Transactional(readOnly = true)
    public String getKern(String scoreId) {
        Score score =
                scoreRepository.findById(scoreId).orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
        scoreFileService.checkCanView(score);

        ScoreFile kern =
                currentFile(scoreId, FileType.KERN).orElseThrow(() -> new AppException(ErrorCode.FILE_NOT_EXISTED));
        return new String(readBytes(kern.getStoragePath()), StandardCharsets.UTF_8);
    }

    @Override
    @Transactional(readOnly = true)
    public ScoreContent getMusicXml(String scoreId) {
        Score score =
                scoreRepository.findById(scoreId).orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
        scoreFileService.checkCanView(score);

        ScoreFile xml = currentFile(scoreId, FileType.MUSICXML)
                .orElseThrow(() -> new AppException(ErrorCode.MUSICXML_NOT_READY));
        return new ScoreContent(readBytes(xml.getStoragePath()), versionOf(xml));
    }

    @Override
    public ScoreContent getMidi(String scoreId) {
        MidiState state = loadMidiState(scoreId);
        if (!state.fresh()) {
            ReentrantLock lock = midiLocks[Math.floorMod(scoreId.hashCode(), LOCK_STRIPES)];
            lock.lock();
            try {
                // Request khác có thể đã sinh xong trong lúc ta chờ khóa: đọc lại trước khi gọi music-ai
                state = loadMidiState(scoreId);
                if (!state.fresh()) {
                    state = regenerateMidi(state);
                }
            } finally {
                lock.unlock();
            }
        }
        return new ScoreContent(readBytes(state.midiPath()), state.xmlVersion());
    }

    // ---------------------------------------------------------------- MIDI

    /**
     * Ảnh chụp trạng thái MIDI của một bản nhạc.
     *
     * @param midiPath đường dẫn MIDI hiện hành, null nếu chưa có hoặc đã lỗi thời
     * @param fresh MIDI còn mới: tồn tại trên đĩa và version không nhỏ hơn version MusicXML hiện hành
     */
    record MidiState(String scoreId, String xmlPath, int xmlVersion, int tempoBpm, String midiPath, boolean fresh) {}

    /** Kiểm tra quyền xem và đọc trạng thái MIDI trong một transaction chỉ-đọc (không giữ transaction khi gọi HTTP). */
    private MidiState loadMidiState(String scoreId) {
        return inTransaction(true, () -> {
            Score score =
                    scoreRepository.findById(scoreId).orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
            scoreFileService.checkCanView(score);
            // /midi chỉ dùng để tải file về (Player phát qua API khác), nên người xem cần được chủ cho phép tải
            scoreFileService.checkCanDownload(score);

            ScoreFile xml = currentFile(scoreId, FileType.MUSICXML)
                    .orElseThrow(() -> new AppException(ErrorCode.MUSICXML_NOT_READY));
            int xmlVersion = versionOf(xml);
            int tempo =
                    score.getTempoBpm() != null && score.getTempoBpm() > 0 ? score.getTempoBpm() : DEFAULT_TEMPO_BPM;

            Optional<ScoreFile> midi = currentFile(scoreId, FileType.MIDI);
            // MIDI sinh từ MusicXML version n mang version n (mục 1.2); nhỏ hơn nghĩa là Editor đã lưu bản mới hơn
            boolean fresh = midi.isPresent()
                    && versionOf(midi.get()) >= xmlVersion
                    && Files.isRegularFile(fileStorageService.resolve(midi.get().getStoragePath()));
            return new MidiState(
                    scoreId,
                    xml.getStoragePath(),
                    xmlVersion,
                    tempo,
                    fresh ? midi.get().getStoragePath() : null,
                    fresh);
        });
    }

    /** Gọi music-ai sinh {@code midi/v{n}.mid} từ MusicXML hiện hành rồi đăng ký vào score_files. */
    private MidiState regenerateMidi(MidiState state) {
        String outPath = "scores/%s/midi/v%d.mid".formatted(state.scoreId(), state.xmlVersion());
        try {
            aiServiceClient.convertMusicXmlToMidi(state.xmlPath(), outPath, state.tempoBpm());
        } catch (RestClientException e) {
            log.warn("Không sinh lại được MIDI cho bản nhạc {}: {}", state.scoreId(), e.getMessage());
            throw new AppException(ErrorCode.AI_SERVICE_UNAVAILABLE);
        }
        Path onDisk = fileStorageService.resolve(outPath);
        if (!Files.isRegularFile(onDisk)) {
            log.error("music-ai báo sinh xong MIDI nhưng không thấy file {}", onDisk);
            throw new AppException(ErrorCode.FILE_NOT_EXISTED);
        }
        inTransaction(false, () -> {
            registerMidi(state.scoreId(), outPath, state.xmlVersion(), onDisk);
            return null;
        });
        return new MidiState(state.scoreId(), state.xmlPath(), state.xmlVersion(), state.tempoBpm(), outPath, true);
    }

    /** Ghi dòng score_files cho MIDI vừa sinh (ghi đè nếu cùng đường dẫn) và hạ is_current của các MIDI khác. */
    private void registerMidi(String scoreId, String storagePath, int sourceVersion, Path onDisk) {
        ScoreFile midi = scoreFileRepository
                .findByScoreIdAndStoragePath(scoreId, storagePath)
                .orElseGet(() -> ScoreFile.builder()
                        .score(scoreRepository.getReferenceById(scoreId))
                        .build());
        midi.setFileType(FileType.MIDI);
        midi.setStoragePath(storagePath);
        midi.setOriginalFileName(storagePath.substring(storagePath.lastIndexOf('/') + 1));
        midi.setContentType("audio/midi");
        midi.setSizeBytes(sizeOf(onDisk));
        midi.setVersion(sourceVersion);
        midi.setIsCurrent(true);
        midi.setMeta("{\"sourceVersion\":" + sourceVersion + ",\"regenerated\":true}");
        ScoreFile saved = scoreFileRepository.save(midi);

        List<ScoreFile> stale =
                scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(scoreId, FileType.MIDI).stream()
                        .filter(f -> !f.getId().equals(saved.getId()) && !Boolean.FALSE.equals(f.getIsCurrent()))
                        .toList();
        stale.forEach(f -> f.setIsCurrent(false));
        if (!stale.isEmpty()) {
            scoreFileRepository.saveAll(stale);
        }
    }

    // ---------------------------------------------------------------- helpers

    /** File hiện hành (is_current không phải false) thuộc loại cho trước. */
    private Optional<ScoreFile> currentFile(String scoreId, FileType type) {
        return scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(scoreId, type).stream()
                .filter(f -> !Boolean.FALSE.equals(f.getIsCurrent()))
                .findFirst();
    }

    private int versionOf(ScoreFile file) {
        return file.getVersion() == null ? 1 : file.getVersion();
    }

    /** Đọc nguyên file trong storage; không có hoặc không đọc được thì FILE_NOT_EXISTED. */
    private byte[] readBytes(String storagePath) {
        Path onDisk = fileStorageService.resolve(storagePath);
        if (!Files.isRegularFile(onDisk)) {
            throw new AppException(ErrorCode.FILE_NOT_EXISTED);
        }
        try {
            return Files.readAllBytes(onDisk);
        } catch (IOException e) {
            log.error("Không đọc được file {}", onDisk, e);
            throw new AppException(ErrorCode.FILE_NOT_EXISTED);
        }
    }

    private long sizeOf(Path path) {
        try {
            return Files.size(path);
        } catch (IOException e) {
            return 0L;
        }
    }

    private <T> T inTransaction(boolean readOnly, Supplier<T> action) {
        TransactionTemplate template = new TransactionTemplate(transactionManager);
        template.setReadOnly(readOnly);
        return template.execute(status -> action.get());
    }
}
