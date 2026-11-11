package com.ptit.music_be.websocket;

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
 * STOMP qua WebSocket (R8): endpoint {@code /ws}, broker trong bộ nhớ, heartbeat 10 giây. Hiện chỉ có một kênh:
 * {@code /user/queue/notifications} (máy chủ gửi, người dùng chỉ nghe). Chạy nhiều máy chủ thì thay broker trong bộ nhớ
 * bằng broker ngoài (RabbitMQ/Redis relay).
 */
@Configuration
@EnableWebSocketMessageBroker
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    public static final String NOTIFICATIONS_DESTINATION = "/user/queue/notifications";
    public static final String NOTIFICATIONS_QUEUE = "/queue/notifications";

    private static final long HEARTBEAT_MILLIS = 10_000;

    private final WebSocketAuthHandshake handshake;
    private final WebSocketSessions sessions;

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
        registry.enableSimpleBroker("/queue")
                .setHeartbeatValue(new long[] {HEARTBEAT_MILLIS, HEARTBEAT_MILLIS})
                .setTaskScheduler(webSocketHeartbeatScheduler());
        registry.setUserDestinationPrefix("/user");
        // Không có điểm nhận tin từ client: client chỉ được đăng ký nghe
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
                if (command == StompCommand.SUBSCRIBE && !NOTIFICATIONS_DESTINATION.equals(accessor.getDestination())) {
                    throw new MessagingException("Destination not allowed");
                }
                if (accessor.getMessageType() == SimpMessageType.MESSAGE) {
                    throw new MessagingException("Clients cannot send messages");
                }
                return message;
            }
        });
    }

    @Override
    public void configureWebSocketTransport(WebSocketTransportRegistration registration) {
        registration.addDecoratorFactory(this::track);
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
