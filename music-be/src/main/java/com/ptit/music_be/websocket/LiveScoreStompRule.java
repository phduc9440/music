package com.ptit.music_be.websocket;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.stereotype.Component;

import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.service.collab.live.LiveAccess;
import com.ptit.music_be.service.collab.live.LiveAccess.Access;

import lombok.RequiredArgsConstructor;

/**
 * Quyền trên các kênh đồng chỉnh sửa (mục 4.4):
 *
 * <ul>
 *   <li>SUBSCRIBE {@code /topic/scores/{id}/...}: cần xem được bản nhạc.
 *   <li>SEND {@code /app/scores/{id}/presence|leave}: cần xem được; {@code join|lock|ops|save}: cần sửa được.
 *   <li>SUBSCRIBE {@code /user/queue/live-*}: hàng đợi riêng của người dùng, chỉ cần đã đăng nhập.
 * </ul>
 *
 * Quyền do {@code ScorePermissionService} quyết định (qua {@link LiveAccess}); lớp này chỉ ánh xạ đích sang mức quyền.
 */
@Component
@RequiredArgsConstructor
public class LiveScoreStompRule implements StompAccessRule {

    private static final Pattern TOPIC = Pattern.compile("^/topic/scores/([^/]+)/(presence|locks|ops|version)$");
    private static final Pattern APP = Pattern.compile("^/app/scores/([^/]+)/(join|presence|leave|lock|ops|save)$");
    private static final Pattern USER_QUEUE =
            Pattern.compile("^/user/queue/live-(join|locks|rejected|errors)$");

    private final LiveAccess access;

    @Override
    public boolean handles(String destination) {
        return destination != null
                && (TOPIC.matcher(destination).matches()
                        || APP.matcher(destination).matches()
                        || USER_QUEUE.matcher(destination).matches());
    }

    @Override
    public void authorize(StompCommand command, String destination, String email) {
        if (USER_QUEUE.matcher(destination).matches()) {
            if (command != StompCommand.SUBSCRIBE) {
                throw new MessagingException("Destination not allowed");
            }
            return;
        }
        Matcher topic = TOPIC.matcher(destination);
        if (topic.matches()) {
            if (command != StompCommand.SUBSCRIBE) {
                throw new MessagingException("Clients cannot send messages");
            }
            requireAccess(email, topic.group(1), false);
            return;
        }
        Matcher app = APP.matcher(destination);
        if (app.matches() && command == StompCommand.SEND) {
            String action = app.group(2);
            boolean needEdit = !action.equals("presence") && !action.equals("leave");
            requireAccess(email, app.group(1), needEdit);
            return;
        }
        throw new MessagingException("Destination not allowed");
    }

    private void requireAccess(String email, String scoreId, boolean needEdit) {
        try {
            Access who = access.resolve(email, scoreId);
            if (needEdit && !who.canEdit()) {
                throw new MessagingException("Forbidden");
            }
        } catch (AppException e) {
            throw new MessagingException("Forbidden");
        }
    }
}
