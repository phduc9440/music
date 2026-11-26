package com.ptit.music_be.service.forum;

import java.util.List;

import com.ptit.music_be.dto.enums.forum.ForumReaction;
import com.ptit.music_be.dto.request.forum.ForumPostRequest;
import com.ptit.music_be.dto.request.forum.ForumThreadRequest;
import com.ptit.music_be.dto.response.common.PageResponse;
import com.ptit.music_be.dto.response.forum.ForumCategoryResponse;
import com.ptit.music_be.dto.response.forum.ForumPostResponse;
import com.ptit.music_be.dto.response.forum.ForumReactionResponse;
import com.ptit.music_be.dto.response.forum.ForumThreadDetailResponse;
import com.ptit.music_be.dto.response.forum.ForumThreadResponse;

/** Diễn đàn (mục 5.5): chuyên mục, chủ đề, trả lời, bình chọn, câu trả lời hay nhất, theo dõi. */
public interface ForumService {

    /** Sắp xếp danh sách chủ đề. */
    enum Sort {
        /** Có hoạt động mới nhất (chủ đề mới hoặc trả lời mới nhất) trước. */
        LATEST,
        /** Nhiều phiếu bình chọn nhất trước. */
        TOP
    }

    List<ForumCategoryResponse> categories();

    PageResponse<ForumThreadResponse> threads(
            String categoryId, String keyword, Sort sort, boolean unanswered, boolean mine, int page, int size);

    /** Toàn bộ bài trả lời (không phân trang). */
    ForumThreadDetailResponse thread(String threadId);

    /**
     * Một trang bài trả lời theo thời gian (bài hay nhất đứng đầu trang 0). {@code focusPostId} hợp lệ thì trả đúng trang
     * chứa bài đó, bỏ qua {@code page}.
     */
    ForumThreadDetailResponse thread(String threadId, int page, int size, String focusPostId);

    /** Như {@link #threads} cho khách chưa đăng nhập: chỉ đọc, không có bộ lọc "của tôi" và không có dấu cá nhân. */
    PageResponse<ForumThreadResponse> publicThreads(
            String categoryId, String keyword, Sort sort, boolean unanswered, int page, int size);

    /** Như {@link #thread} cho khách chưa đăng nhập. */
    ForumThreadDetailResponse publicThread(String threadId);

    /** Như {@link #thread(String, int, int, String)} cho khách chưa đăng nhập. */
    ForumThreadDetailResponse publicThread(String threadId, int page, int size, String focusPostId);

    ForumThreadResponse createThread(ForumThreadRequest request);

    ForumThreadResponse updateThread(String threadId, ForumThreadRequest request);

    void deleteThread(String threadId);

    ForumPostResponse reply(String threadId, ForumPostRequest request);

    ForumPostResponse updatePost(String postId, ForumPostRequest request);

    void deletePost(String postId);

    /** Thích / không thích chủ đề: chưa có thì ghi, trùng lựa chọn đang có thì gỡ, khác thì đổi. */
    ForumReactionResponse reactToThread(String threadId, ForumReaction reaction);

    /** Như {@link #reactToThread} cho bài trả lời. */
    ForumReactionResponse reactToPost(String postId, ForumReaction reaction);

    /** Người đặt chủ đề chọn (hoặc bỏ chọn) câu trả lời hay nhất; trả về chủ đề sau khi đổi. */
    ForumThreadResponse toggleAccepted(String postId);

    void setSubscribed(String threadId, boolean subscribed);
}
