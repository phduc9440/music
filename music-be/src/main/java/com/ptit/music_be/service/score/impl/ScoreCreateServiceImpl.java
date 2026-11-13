package com.ptit.music_be.service.score.impl;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.enums.ai.ProcessingStatus;
import com.ptit.music_be.dto.enums.score.FileType;
import com.ptit.music_be.dto.enums.score.ScoreSource;
import com.ptit.music_be.dto.enums.score.Visibility;
import com.ptit.music_be.dto.request.score.BlankScoreRequest;
import com.ptit.music_be.dto.response.score.BlankScoreResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.score.ScoreFileRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.service.billing.EntitlementService;
import com.ptit.music_be.service.score.ScoreCreateService;
import com.ptit.music_be.service.storage.FileStorageService;
import com.ptit.music_be.utils.MusicXmlInspector;
import com.ptit.music_be.utils.MusicXmlSummary;
import com.ptit.music_be.utils.SecurityUtils;
import com.ptit.music_be.utils.StorageCleanup;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class ScoreCreateServiceImpl implements ScoreCreateService {

    static final int MAX_TITLE = 255;
    static final int MAX_COMPOSER = 255;
    static final int MIN_KEY_FIFTHS = -7;
    static final int MAX_KEY_FIFTHS = 7;
    static final int MIN_BEATS = 1;
    static final int MAX_BEATS = 12;
    static final Set<Integer> BEAT_TYPES = Set.of(2, 4, 8, 16);
    static final int MIN_TEMPO = 20;
    static final int MAX_TEMPO = 300;
    static final int MIN_MEASURES = 1;
    static final int MAX_MEASURES = 200;

    private static final String MUSICXML_CONTENT_TYPE = "application/vnd.recordare.musicxml+xml";
    private static final ObjectMapper JSON = new ObjectMapper();

    private final ScoreRepository scoreRepository;
    private final ScoreFileRepository scoreFileRepository;
    private final MemberRepository memberRepository;
    private final FileStorageService fileStorageService;
    private final EntitlementService entitlementService;

    @Override
    @Transactional
    public BlankScoreResponse createBlank(BlankScoreRequest request) {
        BlankScoreRequest clean = validated(request);
        // Khóa dòng thành viên để hai yêu cầu cùng lúc không cùng lọt qua hạn mức dung lượng
        Member member = memberRepository
                .findByEmailForUpdate(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));

        byte[] xml = BlankScoreBuilder.build(clean);
        MusicXmlSummary summary = MusicXmlInspector.inspect(xml); // tự kiểm: lỗi ở đây là lỗi của builder
        entitlementService.checkStorage(member.getId(), xml.length);

        Score score = scoreRepository.save(Score.builder()
                .member(member)
                .title(clean.getTitle())
                .composer(clean.getComposer())
                .visibility(Visibility.PRIVATE.name())
                .isOfficial(false)
                .processingStatus(ProcessingStatus.COMPLETED.name())
                .sourceType(ScoreSource.MANUAL.name())
                .measureCount(summary.measureCount())
                .keySignature(summary.keySignature())
                .timeSignature(summary.timeSignature())
                .tempoBpm(summary.tempoBpm())
                .staffCount(summary.staffCount())
                .currentVersion(1)
                .build());

        String storagePath = "scores/%s/musicxml/v1.musicxml".formatted(score.getId());
        StorageCleanup.deleteDirectoryOnRollback(fileStorageService, "scores/" + score.getId());
        store(xml, storagePath);
        scoreFileRepository.save(ScoreFile.builder()
                .score(score)
                .fileType(FileType.MUSICXML)
                .originalFileName("v1.musicxml")
                .storagePath(storagePath)
                .contentType(MUSICXML_CONTENT_TYPE)
                .sizeBytes((long) xml.length)
                .version(1)
                .isCurrent(true)
                .meta(metaOf(member, summary))
                .build());
        return BlankScoreResponse.builder().scoreId(score.getId()).version(1).build();
    }

    /** Bản sao đã bỏ khoảng trắng hai đầu; sai tiêu đề/tác giả/tùy chọn thì ném lỗi tương ứng. */
    private static BlankScoreRequest validated(BlankScoreRequest request) {
        if (request == null) {
            throw new AppException(ErrorCode.BLANK_SCORE_OPTION_INVALID);
        }
        String title = request.getTitle() == null ? "" : request.getTitle().strip();
        if (title.isEmpty() || title.length() > MAX_TITLE) {
            throw new AppException(ErrorCode.SCORE_TITLE_INVALID);
        }
        String composer =
                request.getComposer() == null ? "" : request.getComposer().strip();
        if (composer.length() > MAX_COMPOSER) {
            throw new AppException(ErrorCode.SCORE_COMPOSER_INVALID);
        }
        if (request.getPreset() == null
                || request.getMode() == null
                || !within(request.getKeyFifths(), MIN_KEY_FIFTHS, MAX_KEY_FIFTHS)
                || !within(request.getBeats(), MIN_BEATS, MAX_BEATS)
                || !BEAT_TYPES.contains(request.getBeatType())
                || !within(request.getTempoBpm(), MIN_TEMPO, MAX_TEMPO)
                || !within(request.getMeasures(), MIN_MEASURES, MAX_MEASURES)) {
            throw new AppException(ErrorCode.BLANK_SCORE_OPTION_INVALID);
        }
        return BlankScoreRequest.builder()
                .title(title)
                .composer(composer.isEmpty() ? null : composer)
                .preset(request.getPreset())
                .keyFifths(request.getKeyFifths())
                .mode(request.getMode())
                .beats(request.getBeats())
                .beatType(request.getBeatType())
                .tempoBpm(request.getTempoBpm())
                .measures(request.getMeasures())
                .build();
    }

    private static boolean within(Integer value, int min, int max) {
        return value != null && value >= min && value <= max;
    }

    private void store(byte[] xml, String storagePath) {
        try (ByteArrayInputStream in = new ByteArrayInputStream(xml)) {
            fileStorageService.store(in, storagePath);
        } catch (IOException e) {
            throw new AppException(ErrorCode.FILE_STORAGE_ERROR);
        }
    }

    /** Cùng khóa với {@code ScoreEditServiceImpl#buildMeta} để lịch sử phiên bản hiển thị đúng người tạo. */
    private static String metaOf(Member member, MusicXmlSummary summary) {
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("savedBy", member.getEmail());
        if (member.getFullName() != null) {
            meta.put("savedByName", member.getFullName());
        }
        meta.put("measureCount", summary.measureCount());
        try {
            return JSON.writeValueAsString(meta);
        } catch (JsonProcessingException e) {
            return "{}";
        }
    }
}
