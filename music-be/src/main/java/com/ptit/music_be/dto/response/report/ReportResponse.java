package com.ptit.music_be.dto.response.report;

import java.time.LocalDateTime;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ReportResponse {
    String id;
    String targetType;
    /** Bản nhạc bị báo cáo, hoặc bản nhạc chứa góp ý bị báo cáo; null khi đã không còn. */
    String scoreId;
    String commentId;
    /** Tên bản nhạc / trích đoạn góp ý chụp lúc báo cáo. */
    String targetLabel;
    /** false khi đối tượng đã gỡ vào thùng rác hoặc bị ẩn: chỉ còn chọn được Bỏ qua. */
    boolean targetAvailable;
    Party owner;
    Party reporter;
    String reason;
    String details;
    String status;
    String action;
    String resolutionNote;
    Party resolvedBy;
    LocalDateTime resolvedAt;
    LocalDateTime createdAt;
    /** Số báo cáo đang chờ trên cùng đối tượng (tính ngay từ bảng báo cáo). */
    long pendingOnTarget;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class Party {
        String id;
        String email;
        String fullName;
    }
}
