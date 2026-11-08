package com.ptit.music_be.service.export;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ptit.music_be.dto.enums.AiTaskType;
import com.ptit.music_be.dto.enums.FileType;

/**
 * Yêu cầu xuất đã chuẩn hóa. {@code options} có khóa sắp xếp cố định và đủ giá trị mặc định nên dùng được làm khóa cache
 * (so sánh {@code ObjectNode.equals}).
 */
public record ExportSpec(FileType fileType, AiTaskType taskType, ObjectNode options) {

    public int intOption(String name, int fallback) {
        return options.has(name) ? options.get(name).asInt(fallback) : fallback;
    }

    public String textOption(String name, String fallback) {
        return options.has(name) ? options.get(name).asText(fallback) : fallback;
    }
}
