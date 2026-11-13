package com.ptit.music_be.websocket;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.stomp.StompCommand;

import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.service.collab.live.LiveAccess;
import com.ptit.music_be.service.collab.live.LiveAccess.Access;

@ExtendWith(MockitoExtension.class)
class LiveScoreStompRuleTest {

    @Mock
    LiveAccess access;

    @InjectMocks
    LiveScoreStompRule rule;

    private void canView(String email) {
        when(access.resolve(email, "s1")).thenReturn(new Access("s1", "o", "m", "N", false));
    }

    private void canEdit(String email) {
        when(access.resolve(email, "s1")).thenReturn(new Access("s1", "o", "m", "N", true));
    }

    @Test
    void handlesOnlyLiveDestinations() {
        assertThat(rule.handles("/topic/scores/s1/ops")).isTrue();
        assertThat(rule.handles("/app/scores/s1/lock")).isTrue();
        assertThat(rule.handles("/user/queue/live-locks")).isTrue();
        assertThat(rule.handles("/topic/scores/s1/secret")).isFalse();
        assertThat(rule.handles("/topic/other")).isFalse();
        assertThat(rule.handles("/app/scores/s1/../x")).isFalse();
        assertThat(rule.handles(null)).isFalse();
    }

    @Test
    void anyoneWhoCanViewMayListenToTopics() {
        canView("a@mail");

        assertThatCode(() -> rule.authorize(StompCommand.SUBSCRIBE, "/topic/scores/s1/presence", "a@mail"))
                .doesNotThrowAnyException();
    }

    @Test
    void peopleWhoCannotViewAreRefusedOnTopics() {
        when(access.resolve("x@mail", "s1")).thenThrow(new AppException(ErrorCode.UNAUTHORIZED));

        assertThatThrownBy(() -> rule.authorize(StompCommand.SUBSCRIBE, "/topic/scores/s1/ops", "x@mail"))
                .isInstanceOf(MessagingException.class);
    }

    @Test
    void clientsCannotPublishToTopics() {
        assertThatThrownBy(() -> rule.authorize(StompCommand.SEND, "/topic/scores/s1/ops", "a@mail"))
                .isInstanceOf(MessagingException.class);
    }

    @Test
    void editingMessagesNeedEditRightsButPresenceAndLeaveDoNot() {
        canView("v@mail");

        assertThatCode(() -> rule.authorize(StompCommand.SEND, "/app/scores/s1/presence", "v@mail"))
                .doesNotThrowAnyException();
        assertThatCode(() -> rule.authorize(StompCommand.SEND, "/app/scores/s1/leave", "v@mail"))
                .doesNotThrowAnyException();
        for (String action : new String[] {"join", "lock", "ops", "save"}) {
            assertThatThrownBy(() -> rule.authorize(StompCommand.SEND, "/app/scores/s1/" + action, "v@mail"))
                    .isInstanceOf(MessagingException.class);
        }
    }

    @Test
    void editorsMaySendEditingMessages() {
        canEdit("e@mail");

        assertThatCode(() -> rule.authorize(StompCommand.SEND, "/app/scores/s1/ops", "e@mail"))
                .doesNotThrowAnyException();
    }

    @Test
    void userQueuesAreSubscribeOnly() {
        assertThatCode(() -> rule.authorize(StompCommand.SUBSCRIBE, "/user/queue/live-rejected", "a@mail"))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> rule.authorize(StompCommand.SEND, "/user/queue/live-rejected", "a@mail"))
                .isInstanceOf(MessagingException.class);
    }
}
