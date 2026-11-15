package com.ptit.music_be.controller.live;

import java.security.Principal;

import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageExceptionHandler;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.annotation.SendToUser;
import org.springframework.stereotype.Controller;

import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.service.collab.live.LiveCollabService;
import com.ptit.music_be.service.collab.live.LiveMessages.JoinRequest;
import com.ptit.music_be.service.collab.live.LiveMessages.LiveError;
import com.ptit.music_be.service.collab.live.LiveMessages.LockRequest;
import com.ptit.music_be.service.collab.live.LiveMessages.OpsRequest;
import com.ptit.music_be.service.collab.live.LiveMessages.PresenceRequest;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Điểm nhận tin của đồng chỉnh sửa (mục 4.4): client gửi STOMP SEND tới {@code /app/scores/{id}/...}. Quyền đã được
 * {@code LiveScoreStompRule} kiểm ở cổng vào; mọi quy tắc nghiệp vụ nằm ở {@link LiveCollabService}. Lỗi được trả riêng
 * cho tab đã gửi ở {@code /user/queue/live-errors}.
 */
@Controller
@RequiredArgsConstructor
@Slf4j
public class LiveScoreController {

    private final LiveCollabService liveCollabService;

    @MessageMapping("/scores/{scoreId}/join")
    public void join(
            @DestinationVariable String scoreId,
            @Payload JoinRequest request,
            SimpMessageHeaderAccessor headers,
            Principal principal) {
        liveCollabService.join(scoreId, headers.getSessionId(), principal.getName(), request);
    }

    @MessageMapping("/scores/{scoreId}/presence")
    public void presence(
            @DestinationVariable String scoreId,
            @Payload PresenceRequest request,
            SimpMessageHeaderAccessor headers,
            Principal principal) {
        liveCollabService.presence(scoreId, headers.getSessionId(), principal.getName(), request);
    }

    @MessageMapping("/scores/{scoreId}/leave")
    public void leave(@DestinationVariable String scoreId, SimpMessageHeaderAccessor headers) {
        liveCollabService.leave(scoreId, headers.getSessionId());
    }

    @MessageMapping("/scores/{scoreId}/lock")
    public void lock(
            @DestinationVariable String scoreId,
            @Payload LockRequest request,
            SimpMessageHeaderAccessor headers,
            Principal principal) {
        liveCollabService.lock(scoreId, headers.getSessionId(), principal.getName(), request);
    }

    @MessageMapping("/scores/{scoreId}/ops")
    public void ops(
            @DestinationVariable String scoreId,
            @Payload OpsRequest request,
            SimpMessageHeaderAccessor headers,
            Principal principal) {
        liveCollabService.ops(scoreId, headers.getSessionId(), principal.getName(), request);
    }

    @MessageMapping("/scores/{scoreId}/save")
    public void save(@DestinationVariable String scoreId, SimpMessageHeaderAccessor headers) {
        liveCollabService.save(scoreId, headers.getSessionId());
    }

    @MessageExceptionHandler(AppException.class)
    @SendToUser(destinations = "/queue/live-errors", broadcast = false)
    public LiveError onAppException(AppException e) {
        ErrorCode code = e.getErrorCode();
        return new LiveError(code.getCode(), code.getMessage());
    }

    /** Gói sai định dạng hoặc lỗi không lường trước: báo chung, không lộ chi tiết nội bộ. */
    @MessageExceptionHandler(Exception.class)
    @SendToUser(destinations = "/queue/live-errors", broadcast = false)
    public LiveError onUnexpected(Exception e) {
        log.warn("Lỗi xử lý tin cộng tác", e);
        return new LiveError(ErrorCode.LIVE_OP_INVALID.getCode(), ErrorCode.LIVE_OP_INVALID.getMessage());
    }
}
