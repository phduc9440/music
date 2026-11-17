package com.ptit.music_be.dto.request.report;

import com.ptit.music_be.dto.enums.report.ReportAction;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ResolveReportRequest {
    ReportAction action;
    String note;
}
