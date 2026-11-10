package com.ptit.music_be.service.score;

import com.ptit.music_be.dto.response.ViewCountResponse;

public interface PlaybackService {

    /**
     * Ghi nhận một lượt xem khi mở trang phát nhạc. Chỉ tăng khi bản nhạc PUBLIC, người xem không phải chủ sở hữu và
     * chưa được tính trong 30 phút gần đây; các trường hợp còn lại trả về tổng hiện tại với {@code counted = false}.
     * Throws SCORE_NOT_EXISTED hoặc UNAUTHORIZED nếu không có bản nhạc hoặc không có quyền xem.
     */
    ViewCountResponse recordView(String scoreId);
}
