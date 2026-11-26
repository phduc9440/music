package com.ptit.music_be.service.reward;

import com.ptit.music_be.dto.response.reward.PointsResponse;
import com.ptit.music_be.event.RewardEarnedEvent;

/** Sổ điểm thưởng (X-02, mục 7.5): nghe RewardEarnedEvent, cộng điểm theo RewardReason và áp giới hạn. */
public interface PointsService {

    /** Cộng điểm cho một sự kiện; trả về false nếu đã cộng (cùng reason, refId) hoặc vượt giới hạn trong kỳ. */
    boolean award(RewardEarnedEvent event);

    /** Điểm của người đang đăng nhập. */
    PointsResponse mine();
}
