package com.ptit.music_be.dto.enums.ai;

/**
 * Bước hiện tại của một tác vụ, lưu ở {@code ai_tasks.step} để web hiển thị tiến độ (đặc tả mục 1.3 và 2.2).
 * Nhánh feature/omr-preprocess chỉ chạy thật SPLIT_PDF và PREPROCESS; các bước sau dành cho nhánh nhận diện.
 */
public enum AiTaskStep {
    /** Java đã giao việc và music-ai đã nhận (đang xếp hàng), chưa bắt đầu chạy. Chỉ do Java đặt. */
    QUEUED,
    /** Tách PDF thành ảnh từng trang (tiến độ 5-10%). */
    SPLIT_PDF,
    /** Tiền xử lý ảnh: khử nhiễu, căn thẳng, nhị phân hóa, đưa về 1050x1485 (10-30%). */
    PREPROCESS,
    /** Nhận diện ký hiệu bằng Transcoda (30-85%). */
    INFERENCE,
    /** Ghép kern nhiều trang (85-90%). */
    MERGE,
    /** Xuất MusicXML / MIDI (90-100%). */
    EXPORT,
    /** Xuất file: chuẩn bị MusicXML (dịch giọng, đổi tempo, chọn tay) qua music-ai (10%). */
    PREPARE,
    /** Xuất file: MuseScore đang tổng hợp/kết xuất (30-90%). */
    RENDER,
    /** Xuất file: lưu file kết quả và ghi DB (90-100%). */
    SAVE
}
