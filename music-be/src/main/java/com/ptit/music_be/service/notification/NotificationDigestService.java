package com.ptit.music_be.service.notification;

/** Email tóm tắt thông báo chưa đọc hằng ngày cho người đã bật email ở Cài đặt thông báo (mục R8). */
public interface NotificationDigestService {

    /** Gửi bản tóm tắt cho mọi người có thông báo chưa đọc trong 24 giờ qua; trả về số email đã gửi. */
    int sendDaily();
}
