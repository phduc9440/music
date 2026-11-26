package com.ptit.music_be.dto.response.ai;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;

/**
 * Những gì người dùng cần biết trước khi bấm "Nhận diện lại" (OMR-01, OMR-06): số trang sẽ trừ vào hạn mức tháng, lựa
 * chọn của lần trước, và bản nhạc đã được sửa thêm bao nhiêu phiên bản sau lần số hóa gần nhất (kết quả mới sẽ thành phiên
 * bản kế tiếp, bản đã sửa vẫn nằm trong Lịch sử phiên bản).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class OmrRetryInfoResponse {

    /** Số trang của bản gốc = số trang lần này trừ vào hạn mức tháng. */
    Integer pages;

    /** Bản gốc là một file PDF (false: các ảnh). */
    Boolean pdf;

    /** Loại nguồn và tiền xử lý của lần chạy trước (mặc định cho hộp thoại). */
    String sourceType;

    Boolean preprocess;

    /** Phiên bản MusicXML do lần số hóa thành công gần nhất tạo ra; null nếu chưa từng số hóa thành công. */
    Integer omrVersion;

    /** Phiên bản MusicXML hiện hành; kết quả mới sẽ là currentVersion + 1. */
    Integer currentVersion;

    /** Số phiên bản đã lưu sau lần số hóa gần nhất (sửa tay, nhận hợp âm...); 0 nếu chưa sửa gì. */
    Integer editedVersions;

    /** Trạng thái và mã lỗi của tác vụ OMR gần nhất (để gợi ý cách chạy lại hợp lý hơn). */
    String lastStatus;

    String lastErrorCode;

    /** Hạn mức trang OMR mỗi tháng của người bấm (null = không giới hạn) và số đã dùng tháng này. */
    Integer monthlyLimit;

    Integer monthlyUsed;

    /** Số trang tối đa mỗi lần số hóa (đã tính cả trần của hệ thống). */
    Integer perJobLimit;
}
