package com.ptit.music_be.service.admin;

import com.ptit.music_be.dto.request.AdminScoreBulkRequest;
import com.ptit.music_be.dto.response.AdminScoreBulkResponse;

public interface AdminScoreBulkService {

    /** Áp thao tác lên từng bản nhạc, mỗi bản một transaction riêng; trả về số bản thành công và danh sách lỗi. */
    AdminScoreBulkResponse apply(AdminScoreBulkRequest request);
}
