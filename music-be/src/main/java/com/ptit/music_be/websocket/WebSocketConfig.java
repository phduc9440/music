package com.ptit.music_be.websocket;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;
import org.springframework.web.socket.handler.WebSocketHandlerDecorator;

import lombok.RequiredArgsConstructor;

/**
 * STOMP qua WebSocket (R8): endpoint {@code /ws}, broker trong bộ nhớ, heartbeat 10 giây. Kênh thông báo
 * {@code /user/queue/notifications} (máy chủ gửi, người dùng chỉ nghe) luôn mở. Mọi đích khác (SUBSCRIBE hoặc tin client
 * gửi lên {@code /app/**}) mặc định bị chặn và chỉ mở khi có một {@link StompAccessRule} nhận đích đó và cho phép; hiện
 * có {@link LiveScoreStompRule} cho đồng chỉnh sửa. Chạy nhiều máy chủ thì thay broker trong bộ nhớ bằng broker ngoài
 * (RabbitMQ/Redis relay).
 */
@Configuration
@EnableWebSocketMessageBroker
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    public static final String NOTIFICATIONS_DESTINATION = "/user/queue/notifications";
    public static final String NOTIFICATIONS_QUEUE = "/queue/notifications";

    private static final long HEARTBEAT_MILLIS = 10_000;

    /** Gói lớn nhất client được gửi: thao tác cấu trúc mang cả bài (mặc định của Spring chỉ 64KB). */
    private static final int MESSAGE_SIZE_LIMIT = 1024 * 1024;

    private static final int SEND_BUFFER_SIZE_LIMIT = 4 * MESSAGE_SIZE_LIMIT;

    private final WebSocketAuthHandshake handshake;
    private final WebSocketSessions sessions;
    /**
     * Lấy lười: luật cần dịch vụ quyền, mà chuỗi phụ thuộc của nó có thể kéo theo {@code SimpMessagingTemplate}, vốn lại
     * cần chính lớp cấu hình này (vòng phụ thuộc nếu tiêm sớm).
     */
    private final ObjectProvider<StompAccessRule> accessRules;

    @org.springframework.context.annotation.Bean
    TaskScheduler webSocketHeartbeatScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix("ws-heartbeat-");
        return scheduler;
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
                .setHandshakeHandler(handshake)
                .addInterceptors(handshake)
                // Cùng danh sách origin với CorsConfig
                .setAllowedOrigins("http://localhost:5173", "http://localhost:3000");
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/queue", "/topic")
                .setHeartbeatValue(new long[] {HEARTBEAT_MILLIS, HEARTBEAT_MILLIS})
                .setTaskScheduler(webSocketHeartbeatScheduler());
        registry.setUserDestinationPrefix("/user");
        // Tin client gửi lên /app/** chỉ qua được khi có StompAccessRule cho đích đó (xem configureClientInboundChannel)
        registry.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(new ChannelInterceptor() {
            @Override
            public Message<?> preSend(Message<?> message, MessageChannel channel) {
                StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
                if (accessor == null) {
                    return message;
                }
                StompCommand command = accessor.getCommand();
                if (command == StompCommand.CONNECT && accessor.getUser() == null) {
                    throw new MessagingException("Unauthenticated");
                }
                boolean subscribe = command == StompCommand.SUBSCRIBE;
                boolean send = accessor.getMessageType() == SimpMessageType.MESSAGE;
                if (subscribe && NOTIFICATIONS_DESTINATION.equals(accessor.getDestination())) {
                    return message;
                }
                if (subscribe || send) {
                    authorize(accessor, subscribe ? StompCommand.SUBSCRIBE : StompCommand.SEND);
                }
                return message;
            }
        });
    }

    @Override
    public void configureWebSocketTransport(WebSocketTransportRegistration registration) {
        registration
                .setMessageSizeLimit(MESSAGE_SIZE_LIMIT)
                .setSendBufferSizeLimit(SEND_BUFFER_SIZE_LIMIT)
                .addDecoratorFactory(this::track);
    }

    /** Đích ngoài kênh thông báo: phải có luật nhận đích đó và luật phải cho phép, không thì ngắt. */
    private void authorize(StompHeaderAccessor accessor, StompCommand command) {
        String destination = accessor.getDestination();
        String email = accessor.getUser() == null ? null : accessor.getUser().getName();
        if (email == null) {
            throw new MessagingException("Unauthenticated");
        }
        StompAccessRule rule = accessRules.orderedStream()
                .filter(r -> r.handles(destination))
                .findFirst()
                .orElseThrow(() -> new MessagingException(
                        command == StompCommand.SEND ? "Clients cannot send messages" : "Destination not allowed"));
        rule.authorize(command, destination, email);
    }

    /** Ghi nhận phiên đang mở theo email để ngắt được khi tài khoản bị khóa. */
    private WebSocketHandler track(WebSocketHandler handler) {
        return new WebSocketHandlerDecorator(handler) {
            @Override
            public void afterConnectionEstablished(WebSocketSession session) throws Exception {
                String email = emailOf(session);
                if (email != null) {
                    sessions.add(email, session);
                }
                super.afterConnectionEstablished(session);
            }

            @Override
            public void afterConnectionClosed(
                    WebSocketSession session, org.springframework.web.socket.CloseStatus status) throws Exception {
                String email = emailOf(session);
                if (email != null) {
                    sessions.remove(email, session);
                }
                super.afterConnectionClosed(session, status);
            }
        };
    }

    private static String emailOf(WebSocketSession session) {
        return session.getPrincipal() == null ? null : session.getPrincipal().getName();
    }
}
