package com.ptit.music_be.websocket;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.lang.reflect.Type;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.messaging.converter.MappingJackson2MessageConverter;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.ptit.music_be.dto.enums.NotificationType;
import com.ptit.music_be.dto.response.NotificationResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.NotificationRepository;
import com.ptit.music_be.service.notification.NotificationService;

/**
 * Chạy thật cả đường đi của thông báo tức thì (cần MySQL đang chạy): bắt tay bằng cookie access token, đăng ký
 * /user/queue/notifications, rồi NotificationService.notify phải đẩy tới đúng người sau khi commit.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class NotificationWebSocketTest {

    @LocalServerPort
    int port;

    @Value("${jwt.signerKey}")
    String signerKey;

    @Autowired
    MemberRepository memberRepository;

    @Autowired
    NotificationRepository notificationRepository;

    @Autowired
    NotificationService notificationService;

    private String tokenFor(String email) throws Exception {
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .subject(email)
                .issueTime(new Date())
                .expirationTime(Date.from(Instant.now().plusSeconds(300)))
                .claim("scope", "ROLE_USER")
                .build();
        SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS512), claims);
        jwt.sign(new MACSigner(signerKey.getBytes()));
        return jwt.serialize();
    }

    private WebSocketStompClient client() {
        WebSocketStompClient client = new WebSocketStompClient(new StandardWebSocketClient());
        client.setMessageConverter(new MappingJackson2MessageConverter());
        return client;
    }

    private StompSession connect(String email) throws Exception {
        WebSocketHttpHeaders headers = new WebSocketHttpHeaders();
        headers.add("Cookie", "access_token=" + tokenFor(email));
        headers.add("Origin", "http://localhost:5173");
        return client().connectAsync("ws://localhost:" + port + "/ws", headers, new StompSessionHandlerAdapter() {})
                .get(5, TimeUnit.SECONDS);
    }

    @Test
    void notifyReachesTheRecipientOnlyAndRequiresALogin() throws Exception {
        List<Member> members = memberRepository.findAll();
        Member recipient = members.get(0);
        Member other = members.get(1);

        // Không có token thì bắt tay bị từ chối
        ExecutionException refused = assertThrows(ExecutionException.class, () -> client().connectAsync(
                        "ws://localhost:" + port + "/ws", new StompSessionHandlerAdapter() {})
                .get(5, TimeUnit.SECONDS));
        assertNotNull(refused.getCause());

        BlockingQueue<NotificationResponse> mine = new ArrayBlockingQueue<>(4);
        BlockingQueue<NotificationResponse> theirs = new ArrayBlockingQueue<>(4);
        StompSession mySession = connect(recipient.getEmail());
        StompSession otherSession = connect(other.getEmail());
        subscribe(mySession, mine);
        subscribe(otherSession, theirs);
        Thread.sleep(300); // chờ đăng ký có hiệu lực

        notificationService.notify(recipient, null, NotificationType.ANNOUNCEMENT, null, "xin chào realtime", null);

        NotificationResponse got = mine.poll(3, TimeUnit.SECONDS);
        try {
            assertNotNull(got, "người nhận phải nhận được trong vài giây");
            assertEquals("xin chào realtime", got.getMessage());
            assertEquals(NotificationType.ANNOUNCEMENT, got.getType());
            assertNotNull(got.getId());
            assertNull(theirs.poll(500, TimeUnit.MILLISECONDS), "người khác không được nhận");
        } finally {
            if (got != null) {
                notificationRepository.deleteById(got.getId());
            }
            mySession.disconnect();
            otherSession.disconnect();
        }
    }

    private static void subscribe(StompSession session, BlockingQueue<NotificationResponse> into) {
        session.subscribe("/user/queue/notifications", new StompFrameHandler() {
            @Override
            public Type getPayloadType(StompHeaders headers) {
                return NotificationResponse.class;
            }

            @Override
            public void handleFrame(StompHeaders headers, Object payload) {
                into.add((NotificationResponse) payload);
            }
        });
    }
}
