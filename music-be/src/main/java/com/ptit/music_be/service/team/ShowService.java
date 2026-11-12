package com.ptit.music_be.service.team;

import java.util.List;

import com.ptit.music_be.dto.request.team.ShowItemOrderRequest;
import com.ptit.music_be.dto.request.team.ShowItemRequest;
import com.ptit.music_be.dto.request.team.ShowItemStatusRequest;
import com.ptit.music_be.dto.request.team.ShowRequest;
import com.ptit.music_be.dto.response.team.RestorableItemResponse;
import com.ptit.music_be.dto.response.team.ShowDetailResponse;
import com.ptit.music_be.dto.response.team.ShowResponse;

/**
 * Show của team (mục 4.1): danh sách bài theo thứ tự diễn, mỗi bài có người phối, người duyệt, hạn và trạng thái
 * TODO / ARRANGING / IN_REVIEW / APPROVED. Mọi thành viên xem được; OWNER/MANAGER quản lý show và phân công; người phối
 * và người duyệt chỉ chuyển trạng thái theo vai trò của mình trên bài đó.
 */
public interface ShowService {

    List<ShowResponse> shows(String teamId);

    ShowResponse create(String teamId, ShowRequest request);

    ShowDetailResponse get(String showId);

    ShowResponse update(String showId, ShowRequest request);

    /** OWNER/MANAGER xóa mềm show (bài giữ nguyên); khôi phục được trong 30 ngày. */
    void delete(String showId);

    /** OWNER/MANAGER: show đã xóa của team còn trong hạn khôi phục, mới xóa trước. */
    List<RestorableItemResponse> deletedShows(String teamId);

    /** OWNER/MANAGER khôi phục show đã xóa (trong 30 ngày). */
    ShowResponse restore(String showId);

    /** Thêm một bản nhạc của team vào cuối show (kèm phân công nếu có). */
    ShowDetailResponse addItem(String showId, ShowItemRequest request);

    /** Sửa phân công của bài: người phối, người duyệt, hạn, ghi chú. */
    ShowDetailResponse updateItem(String showId, String itemId, ShowItemRequest request);

    ShowDetailResponse removeItem(String showId, String itemId);

    ShowDetailResponse reorder(String showId, ShowItemOrderRequest request);

    /** Đổi trạng thái (kéo thả Kanban, Gửi duyệt, Duyệt, Trả lại) theo luật ở {@code ShowItemTransitions}. */
    ShowDetailResponse changeStatus(String showId, String itemId, ShowItemStatusRequest request);

    /** Job hằng sáng: nhắc bài chưa duyệt có hạn sau 2 ngày và hạn hôm nay. Trả về số thông báo đã gửi. */
    int remindDue();
}
