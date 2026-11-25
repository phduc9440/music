package com.ptit.music_be.service.ai;

import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import com.ptit.music_be.dto.enums.ai.AiTaskStatus;
import com.ptit.music_be.dto.enums.ai.AiTaskType;
import com.ptit.music_be.dto.enums.notification.NotificationType;
import com.ptit.music_be.entity.AiTask;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.service.notification.NotificationService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Báo cho người tạo tác vụ AI khi tác vụ kết thúc (OMR-02): số hóa xong / lỗi, gợi ý hợp âm lỗi (gợi ý hợp âm xong đã có
 * thông báo đề xuất sửa riêng). Đi qua {@link NotificationService} nên vừa lưu vào chuông vừa đẩy qua WebSocket sau khi
 * giao dịch commit; người dùng có thể đóng trang tiến độ mà vẫn biết khi nào xong.
 *
 * <p>params: {@code variant} (omr / chords), {@code title}, {@code taskId} và {@code code} (mã lỗi) để web dựng câu theo
 * ngôn ngữ và mở đúng trang (kết quả hoặc tiến độ). Gọi trong cùng giao dịch ghi trạng thái task; lỗi ở đây chỉ ghi log,
 * không được làm hỏng việc ghi trạng thái.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AiTaskNotifier {

    public static final String VARIANT_OMR = "omr";
    public static final String VARIANT_CHORDS = "chords";

    private final NotificationService notificationService;
    private final ScoreRepository scoreRepository;

    /** Task vừa chuyển sang COMPLETED hoặc FAILED. Hủy (CANCELLED) do chính người dùng bấm nên không báo. */
    public void finished(AiTask task) {
        if (task == null || task.getMember() == null || task.getScore() == null) {
            return;
        }
        String variant = variantOf(task.getTaskType());
        if (variant == null) {
            return;
        }
        boolean completed = task.getStatus() == AiTaskStatus.COMPLETED;
        if (!completed && task.getStatus() != AiTaskStatus.FAILED) {
            return;
        }
        if (completed && VARIANT_CHORDS.equals(variant)) {
            return; // gợi ý hợp âm xong đã gửi SUGGESTION_NEW
        }
        Score score = task.getScore();
        // Bản nhạc đã vào thùng rác trong lúc chạy: không báo. Kiểm tra bằng truy vấn (lọc deleted_at) trước khi đọc
        // score.getTitle(), vì proxy của bản nhạc đã xóa mềm ném EntityNotFoundException và làm hỏng giao dịch callback
        if (!scoreRepository.existsById(score.getId())) {
            return;
        }
        String title = StringUtils.hasText(score.getTitle()) ? score.getTitle() : "";
        String code = completed ? null : errorCode(task.getErrorMessage());
        try {
            notificationService.notify(
                    task.getMember(),
                    null,
                    completed ? NotificationType.AI_TASK_COMPLETED : NotificationType.AI_TASK_FAILED,
                    score.getId(),
                    fallbackMessage(variant, completed, title),
                    NotificationService.params(
                            "variant", variant, "title", title, "taskId", task.getId(), "code", code));
        } catch (RuntimeException e) {
            log.warn("Không tạo được thông báo cho task {}: {}", task.getId(), e.getMessage());
        }
    }

    private static String variantOf(AiTaskType type) {
        if (type == AiTaskType.OMR_CONVERSION) {
            return VARIANT_OMR;
        }
        if (type == AiTaskType.CHORD_GENERATION) {
            return VARIANT_CHORDS;
        }
        return null;
    }

    /** Mã lỗi là phần trước dấu ":" của error_message ("PAGE_UNREADABLE: trang 3" -> PAGE_UNREADABLE). */
    static String errorCode(String message) {
        if (!StringUtils.hasText(message)) {
            return null;
        }
        int colon = message.indexOf(':');
        return (colon < 0 ? message : message.substring(0, colon)).trim();
    }

    /** Câu tiếng Việt dự phòng (bản tóm tắt email, thông báo xem ở bản web cũ). */
    private static String fallbackMessage(String variant, boolean completed, String title) {
        if (VARIANT_OMR.equals(variant)) {
            return completed
                    ? "Đã số hóa xong bản nhạc “" + title + "”, mở để kiểm tra kết quả"
                    : "Số hóa bản nhạc “" + title + "” thất bại";
        }
        return "Gợi ý hợp âm cho bản nhạc “" + title + "” thất bại";
    }
}
