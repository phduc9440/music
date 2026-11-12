package com.ptit.music_be.service.library;

import java.util.List;

import com.ptit.music_be.dto.response.library.TagResponse;

public interface TagService {

    /** Toàn bộ thể loại (tag) hiện có, sắp xếp theo tên. */
    List<TagResponse> getAllTags();
}
