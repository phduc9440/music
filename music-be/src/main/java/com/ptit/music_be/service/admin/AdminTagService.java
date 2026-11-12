package com.ptit.music_be.service.admin;

import java.util.List;

import com.ptit.music_be.dto.request.admin.TagRequest;
import com.ptit.music_be.dto.response.admin.AdminTagResponse;

public interface AdminTagService {

    /** Mọi thể loại kèm số bản nhạc đang dùng, sắp xếp theo tên. */
    List<AdminTagResponse> getTags();

    /** Thêm thể loại; slug tự sinh từ tên (bỏ dấu tiếng Việt). */
    AdminTagResponse create(TagRequest request);

    /** Đổi tên thể loại (slug đổi theo). Các bản nhạc đã gắn thể loại này giữ nguyên. */
    AdminTagResponse update(String id, TagRequest request);

    /** Xóa thể loại, đồng thời gỡ nó khỏi mọi bản nhạc đang dùng (bản nhạc không bị xóa). */
    void delete(String id);
}
