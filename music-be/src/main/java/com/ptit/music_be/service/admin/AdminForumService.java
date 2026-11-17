package com.ptit.music_be.service.admin;

import java.util.List;

import com.ptit.music_be.dto.request.admin.ForumCategoryRequest;
import com.ptit.music_be.dto.response.admin.AdminForumCategoryResponse;
import com.ptit.music_be.dto.response.admin.AdminForumThreadDetailResponse;
import com.ptit.music_be.dto.response.admin.AdminForumThreadResponse;
import com.ptit.music_be.dto.response.common.PageResponse;

/** Quản lý diễn đàn (mục 5.5, quyền FORUM_MANAGE): chuyên mục, ghim / khóa, ẩn và khôi phục chủ đề, bài trả lời. */
public interface AdminForumService {

    /** Bộ lọc trạng thái danh sách chủ đề. */
    enum Status {
        ALL,
        VISIBLE,
        HIDDEN,
        PINNED,
        LOCKED,
        /** Đang có báo cáo chờ xử lý, nhiều báo cáo nhất trước. */
        REPORTED
    }

    List<AdminForumCategoryResponse> categories();

    AdminForumCategoryResponse createCategory(ForumCategoryRequest request);

    AdminForumCategoryResponse updateCategory(String id, ForumCategoryRequest request);

    /** Chỉ xóa được chuyên mục không còn chủ đề nào (kể cả đã ẩn). */
    void deleteCategory(String id);

    /** Sắp xếp lại chuyên mục theo thứ tự id gửi lên. */
    void reorderCategories(List<String> orderedIds);

    PageResponse<AdminForumThreadResponse> threads(
            String keyword, String categoryId, Status status, int page, int size);

    AdminForumThreadDetailResponse thread(String threadId);

    void setThreadHidden(String threadId, boolean hidden);

    void setThreadPinned(String threadId, boolean pinned);

    void setThreadLocked(String threadId, boolean locked);

    void setPostHidden(String postId, boolean hidden);
}
