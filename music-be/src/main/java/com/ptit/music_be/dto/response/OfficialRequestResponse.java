package com.ptit.music_be.dto.response;

import java.time.LocalDateTime;

import com.ptit.music_be.dto.enums.OfficialRequestStatus;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;

/** Lời xin đưa bản nhạc vào kho bản nhạc mẫu. Chủ sở hữu chỉ thấy tên người xin, quản trị viên thấy thêm email. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class OfficialRequestResponse {
    String id;
    String scoreId;
    String scoreTitle;
    String composer;
    OfficialRequestStatus status;
    /** Tên (hoặc email nếu chưa đặt tên) của quản trị viên đã xin. */
    String requestedBy;
    /** Chỉ có ở danh sách của quản trị viên: email chủ sở hữu. */
    String ownerEmail;
    /** Bản sao trong kho mẫu, có khi đã đồng ý. */
    String copyScoreId;

    LocalDateTime createdAt;
    LocalDateTime resolvedAt;
}
