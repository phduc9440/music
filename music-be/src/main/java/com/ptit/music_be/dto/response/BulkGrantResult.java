package com.ptit.music_be.dto.response;

import java.time.LocalDateTime;

import lombok.*;
import lombok.experimental.FieldDefaults;

/**
 * Kết quả cho một người trong một thao tác hàng loạt. Cấp gói: GRANTED (gói mới), RENEWED (gia hạn nối tiếp cùng gói).
 * Xử lý vi phạm: REVOKED (đã thu hồi gói), BANNED (đã cấm), LIFTED (đã gỡ cấm). Chung: SKIPPED (không áp dụng cho người này) hoặc FAILED (thành viên không tồn
 * tại). {@code reason}: mã lỗi khi SKIPPED/FAILED. {@code expiresAt}: hạn gói mới, hoặc ngày hết tạm ngưng.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class BulkGrantResult {
    String memberId;
    String status;
    String reason;
    LocalDateTime expiresAt;
}
