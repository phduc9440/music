package com.ptit.music_be.dto.request.report;

import com.ptit.music_be.dto.enums.report.ReportReason;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ReportRequest {
    ReportReason reason;
    String details;
}
