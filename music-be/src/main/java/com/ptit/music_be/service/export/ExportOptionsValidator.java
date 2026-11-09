package com.ptit.music_be.service.export;

import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ptit.music_be.dto.enums.AiTaskType;
import com.ptit.music_be.dto.enums.FileType;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;

import lombok.RequiredArgsConstructor;

/**
 * Kiểm tra và chuẩn hóa tùy chọn xuất file (đặc tả 5.2). Sai kiểu, sai khoảng, khóa lạ hoặc định dạng chưa hỗ trợ đều
 * trả 2701. Kết quả luôn đủ khóa (điền mặc định) và sắp theo tên khóa.
 */
@Component
@RequiredArgsConstructor
public class ExportOptionsValidator {

    public static final int DEFAULT_BITRATE = 192;
    public static final Set<Integer> BITRATES = Set.of(128, 192, 320);
    public static final Set<String> HANDS = Set.of("BOTH", "RIGHT", "LEFT");

    private static final Set<String> AUDIO_KEYS_MP3 = Set.of("bitrate", "tempoPercent", "transpose", "hands");
    private static final Set<String> AUDIO_KEYS_WAV = Set.of("tempoPercent", "transpose", "hands");

    private final ObjectMapper objectMapper;

    public ExportSpec validate(String targetFormat, JsonNode options, Score score) {
        if (targetFormat == null || targetFormat.isBlank()) {
            throw invalid();
        }
        FileType type;
        try {
            type = FileType.valueOf(targetFormat.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw invalid();
        }
        return switch (type) {
            case MP3, WAV -> validateAudio(type, options, score);
            case MIDI, MUSICXML -> validateNoOptions(type, options);
            case SVG -> validateSvg(options);
            default -> throw invalid();
        };
    }

    /** MIDI và MusicXML trả file hiện hành, không có tùy chọn. */
    private ExportSpec validateNoOptions(FileType type, JsonNode options) {
        requireObject(options, Set.of());
        return new ExportSpec(type, AiTaskType.FORMAT_CONVERSION, objectMapper.createObjectNode());
    }

    /** SVG: {@code page} là "ALL" hoặc số trang từ 1. Tác vụ luôn kết xuất mọi trang nên tùy chọn lưu lại để trống. */
    private ExportSpec validateSvg(JsonNode options) {
        JsonNode node = requireObject(options, Set.of("page"));
        Integer page = null;
        if (node.has("page") && !node.get("page").isNull()) {
            JsonNode value = node.get("page");
            if (value.isTextual() && "ALL".equalsIgnoreCase(value.asText())) {
                page = null;
            } else if (value.isIntegralNumber() && value.canConvertToInt() && value.asInt() >= 1) {
                page = value.asInt();
            } else {
                throw invalid();
            }
        }
        return new ExportSpec(FileType.SVG, AiTaskType.FORMAT_CONVERSION, objectMapper.createObjectNode(), page);
    }

    private ExportSpec validateAudio(FileType type, JsonNode options, Score score) {
        Set<String> allowed = type == FileType.MP3 ? AUDIO_KEYS_MP3 : AUDIO_KEYS_WAV;
        JsonNode node = requireObject(options, allowed);

        Map<String, Object> normalized = new TreeMap<>();
        if (type == FileType.MP3) {
            int bitrate = intValue(node, "bitrate", DEFAULT_BITRATE, 1, 1000);
            if (!BITRATES.contains(bitrate)) {
                throw invalid();
            }
            normalized.put("bitrate", bitrate);
        }
        normalized.put("tempoPercent", intValue(node, "tempoPercent", 100, 20, 200));
        normalized.put("transpose", intValue(node, "transpose", 0, -12, 12));

        String hands = "BOTH";
        if (node.has("hands")) {
            JsonNode value = node.get("hands");
            if (!value.isTextual() || !HANDS.contains(value.asText())) {
                throw invalid();
            }
            hands = value.asText();
        }
        // Chỉ chọn riêng một tay được khi bản nhạc có đúng một part 2 khuông (staff_count = 2)
        if (!"BOTH".equals(hands) && (score.getStaffCount() == null || score.getStaffCount() != 2)) {
            throw invalid();
        }
        normalized.put("hands", hands);

        ObjectNode result = objectMapper.valueToTree(normalized);
        return new ExportSpec(type, AiTaskType.AUDIO_SYNTHESIS, result);
    }

    private JsonNode requireObject(JsonNode options, Set<String> allowedKeys) {
        if (options == null || options.isNull() || options.isMissingNode()) {
            return objectMapper.createObjectNode();
        }
        if (!options.isObject()) {
            throw invalid();
        }
        options.fieldNames().forEachRemaining(name -> {
            if (!allowedKeys.contains(name)) {
                throw invalid();
            }
        });
        return options;
    }

    private static int intValue(JsonNode node, String name, int fallback, int min, int max) {
        if (!node.has(name) || node.get(name).isNull()) {
            return fallback;
        }
        JsonNode value = node.get(name);
        if (!value.isIntegralNumber() || !value.canConvertToInt()) {
            throw invalid();
        }
        int number = value.asInt();
        if (number < min || number > max) {
            throw invalid();
        }
        return number;
    }

    private static AppException invalid() {
        return new AppException(ErrorCode.EXPORT_OPTION_INVALID);
    }
}
