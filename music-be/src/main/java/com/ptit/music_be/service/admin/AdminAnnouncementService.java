package com.ptit.music_be.service.admin;

import com.ptit.music_be.dto.request.AnnouncementRequest;
import com.ptit.music_be.dto.response.AnnouncementResponse;

public interface AdminAnnouncementService {

    /** Gửi thông báo chung tới nhóm đã chọn (chỉ tài khoản đang hoạt động, trừ người gửi). */
    AnnouncementResponse send(AnnouncementRequest request);
}
