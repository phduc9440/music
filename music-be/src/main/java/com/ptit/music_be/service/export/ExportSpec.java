package com.ptit.music_be.service.export;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ptit.music_be.dto.enums.AiTaskType;
import com.ptit.music_be.dto.enums.FileType;

/**
 * Yêu cầu xuất đã chuẩn hóa. {@code options} có khóa sắp xếp cố định và đủ giá trị mặc định nên dùng được làm khóa cache
 * (so sánh {@code ObjectNode.equals}). {@code page} chỉ dùng cho SVG: số trang người dùng muốn (null là tất cả); nó không
 * nằm trong khóa cache vì tác vụ luôn kết xuất mọi trang.
 */
public record ExportSpec(FileType fileType, AiTaskType taskType, ObjectNode options, Integer page) {

    /** Dùng cho định dạng không có tham số trang. */
    public ExportSpec(FileType fileType, AiTaskType taskType, ObjectNode options) {
        this(fileType, taskType, options, null);
    }

    public int intOption(String name, int fallback) {
        return options.has(name) ? options.get(name).asInt(fallback) : fallback;
    }

    public String textOption(String name, String fallback) {
        return options.has(name) ? options.get(name).asText(fallback) : fallback;
    }
}
