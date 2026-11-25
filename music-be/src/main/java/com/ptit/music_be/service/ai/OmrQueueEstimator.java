package com.ptit.music_be.service.ai;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.enums.ai.AiTaskStatus;
import com.ptit.music_be.dto.enums.ai.AiTaskStep;
import com.ptit.music_be.dto.enums.ai.AiTaskType;
import com.ptit.music_be.dto.response.ai.AiTaskResponse;
import com.ptit.music_be.entity.AiTask;
import com.ptit.music_be.repository.ai.AiTaskRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.service.billing.EntitlementService;

import lombok.RequiredArgsConstructor;

/**
 * Ước lượng vị trí trong hàng đợi OMR và thời gian chờ (OMR-10, OMR-T02). music-ai chạy một job một lúc nên mọi task OMR
 * đang chạy hoặc đến trước đều phải xong trước task này. Thời gian mỗi trang lấy trung bình của các task đã xong gần đây
 * (lưu tạm vài phút). Đây chỉ là ước lượng để người dùng biết phải chờ bao lâu: job của gói ưu tiên có thể chen lên trước.
 */
@Component
@RequiredArgsConstructor
public class OmrQueueEstimator {

    /** Khi chưa có task nào xong để đo (máy mới), coi như mỗi trang mất bấy nhiêu giây trên CPU. */
    static final int DEFAULT_SECONDS_PER_PAGE = 45;

    static final int SAMPLE_SIZE = 20;
    static final long CACHE_MILLIS = 5 * 60 * 1000L;
    static final List<AiTaskStatus> ACTIVE = List.of(AiTaskStatus.PENDING, AiTaskStatus.PROCESSING);

    private final AiTaskRepository aiTaskRepository;
    private final ScoreRepository scoreRepository;
    private final ObjectMapper objectMapper;

    private volatile double cachedSecondsPerPage;
    private volatile long cachedAt;

    /** Hàng đợi của một task OMR còn PENDING; null với task khác (đang chạy, đã xong, không phải OMR). */
    public AiTaskResponse.Queue estimate(AiTask task) {
        if (task == null
                || task.getTaskType() != AiTaskType.OMR_CONVERSION
                || task.getStatus() != AiTaskStatus.PENDING) {
            return null;
        }
        double perPage = secondsPerPage();
        int ahead = 0;
        double pagesAhead = 0;
        for (AiTask other :
                aiTaskRepository.findByTaskTypeAndStatusInOrderByCreatedAtAsc(AiTaskType.OMR_CONVERSION, ACTIVE)) {
            if (other.getId().equals(task.getId())) {
                continue;
            }
            boolean running = other.getStatus() == AiTaskStatus.PROCESSING;
            if (!running && !createdBefore(other, task)) {
                continue;
            }
            int pages = pagesOf(other);
            int progress = other.getProgress() == null ? 0 : Math.min(100, Math.max(0, other.getProgress()));
            pagesAhead += running ? pages * (100 - progress) / 100.0 : pages;
            ahead++;
        }
        long waitSeconds = Math.round(pagesAhead * perPage);
        return AiTaskResponse.Queue.builder()
                .position(ahead + 1)
                .pagesAhead((int) Math.ceil(pagesAhead))
                .waitSeconds(waitSeconds)
                .etaSeconds(waitSeconds + Math.round(pagesOf(task) * perPage))
                .busy(AiTaskStep.BUSY.name().equals(task.getStep()))
                .build();
    }

    /** Thời gian chờ tới lượt (giây) của task, 0 nếu không ước lượng được. */
    public long waitSeconds(AiTask task) {
        AiTaskResponse.Queue queue = estimate(task);
        return queue == null || queue.getWaitSeconds() == null ? 0 : queue.getWaitSeconds();
    }

    private static boolean createdBefore(AiTask a, AiTask b) {
        return a.getCreatedAt() != null
                && b.getCreatedAt() != null
                && a.getCreatedAt().isBefore(b.getCreatedAt());
    }

    /**
     * Số trang của task: pagesCharged trong input_data, không có (admin chạy lại) thì số trang của bản nhạc. Không chạm
     * vào proxy {@code task.getScore()} (chỉ lấy id): task cũ của bản nhạc đã vào thùng rác sẽ làm proxy ném
     * EntityNotFoundException và hỏng cả API xem tiến độ.
     */
    int pagesOf(AiTask task) {
        if (task.getInputData() != null) {
            try {
                JsonNode input = objectMapper.readTree(task.getInputData());
                int charged =
                        input.path(EntitlementService.OMR_PAGES_CHARGED_KEY).asInt(0);
                if (charged > 0) {
                    return charged;
                }
            } catch (Exception ignored) {
                // input_data hỏng: dùng số trang của bản nhạc
            }
        }
        Integer pages = task.getScore() == null
                ? null
                : scoreRepository.findPageCountById(task.getScore().getId()).orElse(null);
        return pages == null || pages < 1 ? 1 : pages;
    }

    private double secondsPerPage() {
        long now = System.currentTimeMillis();
        if (cachedAt > 0 && now - cachedAt < CACHE_MILLIS) {
            return cachedSecondsPerPage;
        }
        double seconds = 0;
        int pages = 0;
        for (AiTask done : aiTaskRepository.findTop20ByTaskTypeAndStatusOrderByFinishedAtDesc(
                AiTaskType.OMR_CONVERSION, AiTaskStatus.COMPLETED)) {
            LocalDateTime start = done.getStartedAt();
            LocalDateTime end = done.getFinishedAt();
            if (start == null || end == null || end.isBefore(start)) {
                continue;
            }
            seconds += Duration.between(start, end).toSeconds();
            pages += pagesOf(done);
        }
        double value = pages > 0 && seconds > 0 ? seconds / pages : DEFAULT_SECONDS_PER_PAGE;
        cachedSecondsPerPage = value;
        cachedAt = now;
        return value;
    }
}
