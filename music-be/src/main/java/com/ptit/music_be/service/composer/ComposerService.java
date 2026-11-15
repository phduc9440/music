package com.ptit.music_be.service.composer;

import java.util.List;

import com.ptit.music_be.dto.request.composer.ComposerRequest;
import com.ptit.music_be.dto.response.composer.ComposerResponse;

/** Nhạc sĩ (mục 5.4). */
public interface ComposerService {

    /** Danh sách công khai, nhiều bản công khai trước; keyword tìm theo tên/tên khác, period lọc thời kỳ. */
    List<ComposerResponse> listPublic(String keyword, String period, int limit);

    ComposerResponse getBySlug(String slug);

    /** ADMIN: mọi nhạc sĩ kèm số bản đang gắn. */
    List<ComposerResponse> listForAdmin();

    ComposerResponse create(ComposerRequest request);

    ComposerResponse update(String id, ComposerRequest request);

    /** Xóa nhạc sĩ; bản nhạc giữ nguyên chữ tác giả, chỉ mất liên kết. */
    void delete(String id);

    /** Gắn lại toàn bộ bản nhạc theo danh sách nhạc sĩ hiện tại; trả số bản đổi liên kết. */
    int relinkAll();
}
