package com.ptit.music_be.service.ai;

import com.ptit.music_be.dto.request.AiTaskCompleteRequest;
import com.ptit.music_be.dto.request.AiTaskFileRequest;
import com.ptit.music_be.dto.request.AiTaskProgressRequest;

/**
 * Các thay đổi trạng thái tác vụ AI do music-ai (callback {@code /internal/ai-tasks/**}) hoặc do bộ điều phối/job
 * quét gây ra (đặc tả mục 6.3, 6.4). Đây là nơi DUY NHẤT ghi trạng thái task và {@code scores.processing_status} của
 * luồng OMR, để logic trạng thái nằm một chỗ (đặc tả mục 6.1).
 *
 * <p>Quy tắc chung: task không tồn tại thì ném AI_TASK_NOT_EXISTED; task đã COMPLETED/FAILED/CANCELLED thì bỏ qua và
 * trả bình thường (để music-ai không thử lại mãi).
 */
public interface InternalAiTaskService {

    /**
     * Cập nhật tiến độ. Task PENDING chuyển PROCESSING (đặt started_at lần đầu) và Score chuyển PROCESSING. Tiến độ
     * không được giảm, vi phạm thì ném INVALID_REQUEST.
     */
    void updateProgress(String taskId, AiTaskProgressRequest request);

    /**
     * Ghi một file kết quả (PNG trang, KERN, MUSICXML, MIDI) vào score_files. storagePath phải nằm trong
     * {@code scores/{scoreId}/} và file phải có trên đĩa; ghi lại cùng đường dẫn thì cập nhật dòng cũ.
     */
    void addFile(String taskId, AiTaskFileRequest request);

    /**
     * Đánh dấu COMPLETED, tiến độ 100, ghi result_data và cập nhật metadata của Score.
     * Khi omr.stop-after=EXPORT (mặc định) mà task chưa đăng ký MusicXML nào thì chuyển FAILED EXPORT_ERROR thay vì
     * COMPLETED. Đồng bộ scores.current_version theo MusicXML hiện hành.
     */
    void complete(String taskId, AiTaskCompleteRequest request);

    /**
     * Đánh dấu FAILED, error_message = "MÃ" hoặc "MÃ: message", Score chuyển FAILED. Cũng dùng cho job quét
     * (TASK_TIMEOUT, AI_SERVICE_UNAVAILABLE) và bộ điều phối (JOB_REJECTED).
     */
    void fail(String taskId, String errorCode, String message);

    /** Ghi nhận music-ai đã nhận job: task PENDING chưa có step thì đặt step = QUEUED. */
    void markQueued(String taskId);

    /** Ghi nhận gửi sang music-ai thất bại: task PENDING tăng retry_count. Trả về retry_count mới. */
    int recordSendFailure(String taskId);
}
