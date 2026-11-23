package com.ptit.music_be.dto.enums.score;

/**
 * Giấy phép của bản nhạc do chủ sở hữu chọn (mục R4). Chưa chọn (null) hiểu là {@link #ALL_RIGHTS_RESERVED}. Chỉ giấy phép
 * khác "bảo lưu mọi quyền" mới cho bật "Cho phép tạo bản phối".
 */
public enum ScoreLicense {
    /** Bảo lưu mọi quyền: người khác không được tạo bản phối. */
    ALL_RIGHTS_RESERVED,
    /** Phạm vi công cộng (CC0). */
    CC0,
    /** Ghi công tác giả (CC BY). */
    CC_BY,
    /** Ghi công và chia sẻ giống nhau (CC BY-SA): bản phối phải giữ cùng giấy phép. */
    CC_BY_SA,
    /** Ghi công, phi thương mại (CC BY-NC): bản phối phải giữ cùng giấy phép. */
    CC_BY_NC;

    public boolean allowsDerivatives() {
        return this != ALL_RIGHTS_RESERVED;
    }

    /** Bản phối bắt buộc giữ nguyên giấy phép của bản gốc (SA, NC). */
    public boolean locksDerivatives() {
        return this == CC_BY_SA || this == CC_BY_NC;
    }
}
