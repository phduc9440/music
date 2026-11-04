package com.ptit.music_be.worker;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import jakarta.annotation.PreDestroy;

import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.HttpClientErrorException;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.client.AiServiceClient;
import com.ptit.music_be.client.OmrJobRequest;
import com.ptit.music_be.configuration.AiServiceProperties;
import com.ptit.music_be.dto.enums.AiTaskError;
import com.ptit.music_be.dto.enums.AiTaskStatus;
import com.ptit.music_be.dto.enums.AiTaskType;
import com.ptit.music_be.dto.enums.FileType;
import com.ptit.music_be.entity.AiTask;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.event.OmrTaskCreatedEvent;
import com.ptit.music_be.repository.AiTaskRepository;
import com.ptit.music_be.repository.ScoreFileRepository;
import com.ptit.music_be.service.InternalAiTaskService;

import lombok.extern.slf4j.Slf4j;

/**
 * Bộ điều phối giao tác vụ OMR sang music-ai (đặc tả mục 6.4).
 *
 * <ul>
 *   <li>Nghe {@link OmrTaskCreatedEvent} với AFTER_COMMIT để music-ai không bao giờ đọc khi DB chưa commit.
 *   <li>Việc gọi HTTP chạy trên luồng riêng để request upload không phải chờ connect timeout khi music-ai tắt.
 *   <li>Gửi thành công: task vẫn PENDING nhưng có step = QUEUED (đã được music-ai nhận, đang xếp hàng) nên job quét
 *       không gửi lại. Gửi lỗi: giữ PENDING (step còn null), tăng retry_count để job quét gửi lại sau.
 * </ul>
 */
@Component
@Slf4j
public class AiTaskDispatcher {

    private final AiTaskRepository aiTaskRepository;
    private final ScoreFileRepository scoreFileRepository;
    private final InternalAiTaskService internalAiTaskService;
    private final AiServiceClient aiServiceClient;
    private final AiServiceProperties aiServiceProperties;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate transactionTemplate;

    /** Task đang được gửi, tránh sự kiện và job quét cùng gửi một task hai lần. */
    private final Set<String> inFlight = ConcurrentHashMap.newKeySet();

    private final ExecutorService executor = Executors.newFixedThreadPool(2, runnable -> {
        Thread thread = new Thread(runnable, "ai-dispatch");
        thread.setDaemon(true);
        return thread;
    });

    public AiTaskDispatcher(
            AiTaskRepository aiTaskRepository,
            ScoreFileRepository scoreFileRepository,
            InternalAiTaskService internalAiTaskService,
            AiServiceClient aiServiceClient,
            AiServiceProperties aiServiceProperties,
            ObjectMapper objectMapper,
            PlatformTransactionManager transactionManager) {
        this.aiTaskRepository = aiTaskRepository;
        this.scoreFileRepository = scoreFileRepository;
        this.internalAiTaskService = internalAiTaskService;
        this.aiServiceClient = aiServiceClient;
        this.aiServiceProperties = aiServiceProperties;
        this.objectMapper = objectMapper;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.transactionTemplate.setReadOnly(true);
    }

    @PreDestroy
    void shutdown() {
        executor.shutdown();
    }

    /** Task OMR mới đã commit: giao sang music-ai (bất đồng bộ). */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onOmrTaskCreated(OmrTaskCreatedEvent event) {
        executor.execute(() -> dispatch(event.taskId()));
    }

    /** Yêu cầu music-ai dừng job của task đã hủy. Chạy nền; lỗi chỉ ghi log vì task đã CANCELLED ở DB. */
    public void cancelRemote(String taskId) {
        executor.execute(() -> {
            try {
                aiServiceClient.cancelOmrJob(taskId);
            } catch (RuntimeException e) {
                log.warn("Không báo hủy được job {} sang music-ai: {}", taskId, e.getMessage());
            }
        });
    }

    /**
     * Gửi một task PENDING sang music-ai (đồng bộ). Không ném lỗi ra ngoài: kết quả được ghi vào DB qua
     * {@link InternalAiTaskService}. Dùng cho cả lần gửi đầu và lần gửi lại của job quét.
     */
    public void dispatch(String taskId) {
        if (!inFlight.add(taskId)) {
            return;
        }
        try {
            OmrJobRequest job;
            try {
                job = prepare(taskId).orElse(null);
            } catch (IllegalStateException e) {
                internalAiTaskService.fail(taskId, AiTaskError.ORIGINAL_FILE_MISSING.name(), null);
                return;
            }
            if (job == null) {
                return;
            }
            send(taskId, job);
        } catch (RuntimeException e) {
            log.error("Lỗi không mong đợi khi giao task {}", taskId, e);
        } finally {
            inFlight.remove(taskId);
        }
    }

    private void send(String taskId, OmrJobRequest job) {
        try {
            aiServiceClient.submitOmrJob(job);
        } catch (HttpClientErrorException e) {
            // 4xx (ví dụ 422): dữ liệu job sai, gửi lại cũng vô ích -> báo lỗi luôn (đặc tả mục 6.2)
            log.warn("music-ai từ chối task {}: {} {}", taskId, e.getStatusCode(), e.getResponseBodyAsString());
            internalAiTaskService.fail(
                    taskId, AiTaskError.JOB_REJECTED.name(), e.getStatusCode().toString());
            return;
        } catch (RuntimeException e) {
            // Lỗi mạng, timeout hoặc 5xx: giữ PENDING và tăng retry_count, job quét sẽ gửi lại
            int retries = internalAiTaskService.recordSendFailure(taskId);
            log.warn("Không gửi được task {} sang music-ai (lần lỗi {}): {}", taskId, retries, e.getMessage());
            return;
        }
        internalAiTaskService.markQueued(taskId);
    }

    /**
     * Dựng body gửi music-ai từ DB. Trả rỗng nếu task không còn PENDING (đã hủy, đã chạy...). Ném
     * IllegalStateException nếu không còn file gốc nào để xử lý.
     */
    private Optional<OmrJobRequest> prepare(String taskId) {
        return transactionTemplate.execute(status -> {
            AiTask task = aiTaskRepository.findById(taskId).orElse(null);
            if (task == null
                    || task.getStatus() != AiTaskStatus.PENDING
                    || task.getTaskType() != AiTaskType.OMR_CONVERSION
                    || task.getScore() == null) {
                return Optional.<OmrJobRequest>empty();
            }
            String scoreId = task.getScore().getId();

            List<OmrJobRequest.Input> inputs = new ArrayList<>();
            List<ScoreFile> pdfs =
                    scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(scoreId, FileType.ORIGINAL_PDF);
            if (!pdfs.isEmpty()) {
                inputs.add(new OmrJobRequest.Input(pdfs.getFirst().getStoragePath(), "PDF", null));
            } else {
                int index = 1;
                for (ScoreFile image : scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(
                        scoreId, FileType.ORIGINAL_IMAGE)) {
                    int page = image.getPageNumber() != null ? image.getPageNumber() : index;
                    inputs.add(new OmrJobRequest.Input(image.getStoragePath(), "IMAGE", page));
                    index++;
                }
            }
            if (inputs.isEmpty()) {
                throw new IllegalStateException("Task " + taskId + " không còn file gốc");
            }
            // Bản MusicXML mới luôn là version kế tiếp, nên nhận diện lại sinh v2, v3... và không ghi đè bản cũ
            int currentVersion = task.getScore().getCurrentVersion() == null
                    ? 0
                    : task.getScore().getCurrentVersion();
            return Optional.of(
                    new OmrJobRequest(taskId, scoreId, inputs, buildOptions(task.getInputData(), currentVersion + 1)));
        });
    }

    /**
     * options gửi music-ai: lấy preprocess/sourceType/binarize từ ai_tasks.input_data, thêm stopAfter từ cấu hình
     * omr.stop-after để music-ai biết dừng ở bước nào, và musicXmlVersion để music-ai đặt tên musicxml/v{n}.musicxml,
     * midi/v{n}.mid cho lần xuất này.
     */
    private Map<String, Object> buildOptions(String inputData, int musicXmlVersion) {
        Map<String, Object> options = new LinkedHashMap<>();
        options.put("preprocess", true);
        options.put("binarize", true);
        if (inputData != null && !inputData.isBlank()) {
            try {
                JsonNode node = objectMapper.readTree(inputData);
                if (node.hasNonNull("preprocess")) {
                    options.put("preprocess", node.get("preprocess").asBoolean(true));
                }
                if (node.hasNonNull("binarize")) {
                    options.put("binarize", node.get("binarize").asBoolean(true));
                }
                if (node.hasNonNull("sourceType")) {
                    options.put("sourceType", node.get("sourceType").asText());
                }
            } catch (Exception e) {
                log.warn("input_data không phải JSON hợp lệ, dùng tùy chọn mặc định: {}", e.getMessage());
            }
        }
        options.put("stopAfter", aiServiceProperties.getStopAfter());
        options.put("musicXmlVersion", musicXmlVersion);
        return options;
    }
}
