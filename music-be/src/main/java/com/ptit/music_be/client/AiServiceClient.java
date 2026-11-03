package com.ptit.music_be.client;

import java.time.Duration;

import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import com.ptit.music_be.configuration.AiServiceProperties;

/**
 * Client gọi REST sang music-ai (đặc tả mục 6.2). Mọi lệnh gọi kèm header {@code X-Internal-Key}. Lỗi mạng, timeout
 * hay HTTP không thành công được ném ra dạng {@code RestClientException} để bộ điều phối quyết định gửi lại hay báo lỗi.
 */
@Component
public class AiServiceClient {

    private final RestClient restClient;

    public AiServiceClient(AiServiceProperties properties) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        // Connect timeout 5 giây theo đặc tả 6.4: music-ai không phản hồi thì thất bại nhanh, không treo luồng gọi
        requestFactory.setConnectTimeout(Duration.ofMillis(properties.getConnectTimeoutMs()));
        requestFactory.setReadTimeout(Duration.ofMillis(properties.getReadTimeoutMs()));
        this.restClient = RestClient.builder()
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

    /** Yêu cầu music-ai dừng job đang chờ/chạy. Người gọi tự quyết định xử lý lỗi (thường chỉ ghi log). */
    public void cancelOmrJob(String taskId) {
        restClient.delete().uri("/omr/jobs/{taskId}", taskId).retrieve().toBodilessEntity();
    }
}
