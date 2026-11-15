package com.ptit.music_be.service.report;

import com.ptit.music_be.dto.enums.report.ReportStatus;
import com.ptit.music_be.dto.enums.report.ReportTargetType;
import com.ptit.music_be.dto.request.report.ReportRequest;
import com.ptit.music_be.dto.request.report.ResolveReportRequest;
import com.ptit.music_be.dto.response.common.PageResponse;
import com.ptit.music_be.dto.response.report.ReportResponse;

/** Báo cáo vi phạm (R5): người dùng báo cáo bản nhạc / góp ý, admin xử lý ở hàng chờ. */
public interface ContentReportService {

    /** Báo cáo một bản nhạc mình xem được (không phải của mình). Lỗi 4002–4005. */
    void reportScore(String scoreId, ReportRequest request);

    /** Báo cáo một góp ý trên bản nhạc mình xem được (không phải của mình). */
    void reportComment(String commentId, ReportRequest request);

    /** Hàng chờ cho admin: lọc theo trạng thái, loại đối tượng; chờ xử lý thì cũ nhất trước. Cần REPORTS_MODERATE. */
    PageResponse<ReportResponse> list(int page, int size, ReportStatus status, ReportTargetType targetType);

    /** Số báo cáo đang chờ, tính ngay từ bảng báo cáo. */
    long pendingCount();

    /** Xử lý một báo cáo; mọi báo cáo đang chờ trên cùng đối tượng đóng cùng lúc. */
    ReportResponse resolve(String reportId, ResolveReportRequest request);
}
