package com.ptit.music_be.service.ai;

import java.util.List;

import org.springframework.web.multipart.MultipartFile;

import com.ptit.music_be.dto.request.OmrRetryRequest;
import com.ptit.music_be.dto.response.AiTaskResponse;
import com.ptit.music_be.dto.response.OmrResultResponse;
import com.ptit.music_be.dto.response.OmrUploadResponse;

public interface OmrService {

    /**
     * Nhận đúng 1 PDF (1-20 trang) hoặc 1-20 ảnh PNG/JPG/JPEG theo thứ tự trang. Tạo Score, lưu file gốc và xếp
     * hàng một tác vụ OMR_CONVERSION.
     *
     * @param title tiêu đề, rỗng thì lấy theo tên file đầu tiên
     * @param composer tác giả (tùy chọn, tối đa 255 ký tự)
     * @param sourceType PHOTO / SCAN / PDF_NATIVE; rỗng thì tự đoán (PDF -> PDF_NATIVE, ảnh -> PHOTO)
     */
    OmrUploadResponse upload(List<MultipartFile> files, String title, String composer, String sourceType);

    /**
     * Chạy lại OMR trên file gốc đã lưu (đặc tả mục 2.2 luồng 6): tạo task OMR_CONVERSION mới. Cần quyền sửa bản nhạc
     * (UNAUTHORIZED), không cho khi score đang có task OMR PENDING/PROCESSING (SCORE_BUSY 2201), người dùng đang có
     * đủ 3 task OMR thì TASK_LIMIT_EXCEEDED (2202). Ảnh trang đã tiền xử lý của lần trước bị xóa vì sẽ được sinh lại.
     *
     * @param request tùy chọn; {@code preprocess} để trống thì dùng lại lựa chọn của lần chạy trước (mặc định true)
     */
    AiTaskResponse retry(String scoreId, OmrRetryRequest request);

    /** ADMIN: chạy lại OMR của bất kỳ bản nhạc nào (dùng lại tham số lần trước); task gán cho chủ bản nhạc. */
    AiTaskResponse retryAsAdmin(String scoreId);

    /**
     * Kết quả của lần nhận diện mới nhất (đặc tả mục 2.3, 7.2): gộp {@code result_data} của task OMR mới nhất với id
     * các file hiện hành. Cần quyền xem bản nhạc (UNAUTHORIZED). Bản nhạc chưa từng có task OMR thì ném
     * AI_TASK_NOT_EXISTED (2101).
     */
    OmrResultResponse getResult(String scoreId);
}
