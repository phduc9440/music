package com.ptit.music_be.service.home;

import org.springframework.core.io.Resource;

import com.ptit.music_be.dto.response.HomeSummaryResponse;
import com.ptit.music_be.dto.response.PublicHomeResponse;

/** Trang chủ (mục 5.3): trang giới thiệu cho khách và trang làm việc cho người đã đăng nhập. */
public interface HomeService {

    /** Dữ liệu trang chủ cho khách: bản nổi bật, tác giả, số liệu thật. Kết quả được nhớ 5 phút. */
    PublicHomeResponse getPublicHome();

    /** Trang làm việc của người đang đăng nhập. */
    HomeSummaryResponse getSummary();

    /**
     * Ảnh trang 1 của một bản đang công khai, cho khách xem không cần đăng nhập. Chỉ trả ảnh dùng làm ảnh đại diện
     * (giống quy tắc hiện ảnh trang 1 cho người có quyền xem); bản chưa công khai báo không tồn tại.
     */
    Thumbnail loadPublicThumbnail(String scoreId);

    record Thumbnail(Resource resource, String contentType) {}
}
