package com.ptit.music_be.dto.response;

import java.time.LocalDateTime;

import lombok.*;
import lombok.experimental.FieldDefaults;

/**
 * Kết quả cấp gói cho một người trong lần cấp hàng loạt. {@code status}: GRANTED (gói mới), RENEWED (gia hạn nối tiếp cùng
 * gói), SKIPPED (không cần cấp: SUPER_ADMIN, hoặc ADMIN đang có Pro theo vai trò mà cấp Pro) hoặc FAILED (thành viên không
 * tồn tại). {@code reason}: mã lỗi khi SKIPPED/FAILED.
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
