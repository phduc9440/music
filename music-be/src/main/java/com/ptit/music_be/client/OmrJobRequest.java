package com.ptit.music_be.client;

import java.util.List;
import java.util.Map;

/**
 * Body của {@code POST {music-ai}/omr/jobs} (đặc tả mục 6.2). Đường dẫn trong {@code inputs} là đường dẫn TƯƠNG ĐỐI so
 * với gốc storage dùng chung giữa Java và music-ai.
 *
 * @param inputs file gốc theo thứ tự trang: 1 PDF (kind=PDF, page=null) hoặc nhiều ảnh (kind=IMAGE, page=1..n)
 * @param options preprocess, binarize, sourceType, stopAfter
 */
public record OmrJobRequest(String taskId, String scoreId, List<Input> inputs, Map<String, Object> options) {

    public record Input(String path, String kind, Integer page) {}
}
