package com.ptit.music_be.client;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import com.fasterxml.jackson.databind.JsonNode;
import com.ptit.music_be.configuration.AiServiceProperties;

/**
 * Client gọi REST sang music-ai (đặc tả mục 6.2). Mọi lệnh gọi kèm header {@code X-Internal-Key}. Lỗi mạng, timeout
 * hay HTTP không thành công được ném ra dạng {@code RestClientException} để bộ điều phối quyết định gửi lại hay báo lỗi.
 */
@Component
public class AiServiceClient {

    private final RestClient restClient;

    /** Dùng cho các lệnh chuyển đổi đồng bộ (đợi kết quả), read timeout dài hơn lệnh giao việc. */
    private final RestClient convertClient;

    public AiServiceClient(AiServiceProperties properties) {
        this.restClient = buildClient(properties, properties.getReadTimeoutMs());
        this.convertClient = buildClient(properties, properties.getConvertTimeoutMs());
    }

    private static RestClient buildClient(AiServiceProperties properties, int readTimeoutMs) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        // Connect timeout 5 giây theo đặc tả 6.4: music-ai không phản hồi thì thất bại nhanh, không treo luồng gọi
        requestFactory.setConnectTimeout(Duration.ofMillis(properties.getConnectTimeoutMs()));
        requestFactory.setReadTimeout(Duration.ofMillis(readTimeoutMs));
        return RestClient.builder()
                .baseUrl(properties.getBaseUrl())
                .requestFactory(requestFactory)
                .defaultHeader(AiServiceProperties.INTERNAL_KEY_HEADER, properties.getInternalKey())
                .build();
    }

    /** Giao một job OMR. music-ai trả 202 khi đã nhận (gọi lại với cùng taskId vẫn trả 202, không tạo job mới). */
    public void submitOmrJob(OmrJobRequest request) {
        restClient
                .post()
                .uri("/omr/jobs")
                .contentType(MediaType.APPLICATION_JSON)
                .body(request)
                .retrieve()
                .toBodilessEntity();
    }

    /**
     * Sinh lại file MIDI từ MusicXML (đặc tả mục 6.2, {@code POST /convert/musicxml-to-midi}), đồng bộ: trả về khi
     * music-ai đã ghi xong {@code outPath}. Cả hai đường dẫn là tương đối so với gốc storage dùng chung.
     */
    public void convertMusicXmlToMidi(String musicXmlPath, String outPath, int tempoBpm) {
        convertClient
                .post()
                .uri("/convert/musicxml-to-midi")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("musicXmlPath", musicXmlPath, "outPath", outPath, "tempoBpm", tempoBpm))
                .retrieve()
                .toBodilessEntity();
    }

    /** Yêu cầu music-ai dừng job đang chờ/chạy. Người gọi tự quyết định xử lý lỗi (thường chỉ ghi log). */
    public void cancelOmrJob(String taskId) {
        restClient.delete().uri("/omr/jobs/{taskId}", taskId).retrieve().toBodilessEntity();
    }

    /**
     * Chuẩn bị MusicXML trước khi xuất file ({@code POST /convert/prepare}), đồng bộ: dịch giọng, đổi tempo, chọn
     * tay, đặt/ẩn tiêu đề, bỏ hợp âm. Tham số null thì không gửi. Đường dẫn tương đối so với gốc storage.
     */
    public void prepareMusicXml(
            String inPath,
            String outPath,
            int transpose,
            int tempoPercent,
            String hands,
            String title,
            String composer,
            Boolean showTitle,
            Boolean stripHarmony) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("inPath", inPath);
        body.put("outPath", outPath);
        body.put("transpose", transpose);
        body.put("tempoPercent", tempoPercent);
        body.put("hands", hands);
        if (title != null) {
            body.put("title", title);
        }
        if (composer != null) {
            body.put("composer", composer);
        }
        if (showTitle != null) {
            body.put("showTitle", showTitle);
        }
        if (stripHarmony != null) {
            body.put("stripHarmony", stripHarmony);
        }
        convertClient
                .post()
                .uri("/convert/prepare")
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .toBodilessEntity();
    }

    /**
     * Gợi ý hợp âm (R3, {@code POST /chords/generate}, model AutoHarmonizer + lấy mẫu), đồng bộ: music-ai đọc
     * {@code inPath}, ghi tới 3 phương án (A ở {@code outPath}, B, C ở {@code <outPath>-2/-3.musicxml}); mỗi lần gọi ra
     * kết quả khác. Lỗi dự đoán được: 422 với {@code detail.code} (NO_MELODY, ALREADY_HARMONIZED, NO_CHORDS, TOO_LONG,
     * PARSE_ERROR).
     *
     * @param style màu hợp âm: NATURAL, SIMPLE, COLORFUL hoặc JAZZY
     * @param replaceExisting true: bỏ hết hợp âm đang có rồi gợi ý lại toàn bộ
     * @param creativity SAFE, BALANCED hoặc BOLD
     * @param density SPARSE, NORMAL hoặc DENSE
     * @param options số phương án (1..3, theo gói của người bấm)
     * @param melodyPart part giai điệu (từ 0), null thì music-ai lấy part đầu có nốt có cao độ
     * @param melodyStaff khuông giai điệu trong part (từ 1), null thì khuông 1
     */
    public ChordGenerationResult generateChords(
            String inPath,
            String outPath,
            String style,
            boolean replaceExisting,
            String creativity,
            String density,
            int options,
            Integer melodyPart,
            Integer melodyStaff) {
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("inPath", inPath);
        body.put("outPath", outPath);
        body.put("style", style);
        body.put("replaceExisting", replaceExisting);
        body.put("creativity", creativity);
        body.put("density", density);
        body.put("options", options);
        if (melodyPart != null) {
            body.put("melodyPart", melodyPart);
        }
        if (melodyStaff != null) {
            body.put("melodyStaff", melodyStaff);
        }
        return convertClient
                .post()
                .uri("/chords/generate")
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .body(ChordGenerationResult.class);
    }

    /**
     * So sánh hai MusicXML của cùng một bản nhạc ({@code POST /analysis/diff}), đồng bộ. Trả về JSON
     * {@code {measures: [...], summary: {...}}} của music-ai. File hỏng: music-ai trả 422 ({@code HttpClientErrorException}).
     */
    public JsonNode diffMusicXml(String basePath, String targetPath) {
        return convertClient
                .post()
                .uri("/analysis/diff")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("basePath", basePath, "targetPath", targetPath))
                .retrieve()
                .body(JsonNode.class);
    }

    /**
     * Chuẩn hóa một file MusicXML trong storage ({@code POST /convert/normalize}), đồng bộ: gộp nhiều part thành piano
     * nhiều staff, đánh lại số ô nhịp, đặt tempo; ghi kết quả ra {@code outPath} và trả metadata để cập nhật
     * {@code scores}. Hai đường dẫn tương đối so với gốc storage và thuộc cùng một bản nhạc.
     */
    public MusicXmlNormalizeResult normalizeMusicXml(String inPath, String outPath) {
        return convertClient
                .post()
                .uri("/convert/normalize")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("inPath", inPath, "outPath", outPath))
                .retrieve()
                .body(MusicXmlNormalizeResult.class);
    }
}
