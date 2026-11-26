package com.ptit.music_be.service.referral;

import com.ptit.music_be.dto.response.referral.ReferralResponse;
import com.ptit.music_be.entity.Member;

/** Mời bạn (7.5): mã giới thiệu và thưởng khi người được mời số hóa xong bản đầu tiên. */
public interface ReferralService {

    /** Mã giới thiệu của người đang đăng nhập (sinh lần đầu khi gọi) và số liệu lời mời. */
    ReferralResponse mine();

    /**
     * Gọi trong transaction hoàn tất một tác vụ số hóa (OMR) của {@code member}. Nếu người này đăng ký bằng mã giới thiệu
     * và chưa được tính thưởng thì đánh dấu đã thưởng và phát sự kiện thưởng cho cả người mời lẫn người được mời. Chỉ xảy ra
     * một lần cho mỗi người được mời.
     */
    void onDigitized(Member member);
}
