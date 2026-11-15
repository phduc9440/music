package com.ptit.music_be.service.collab.live;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;

import org.junit.jupiter.api.Test;

import com.ptit.music_be.service.collab.live.LiveMessages.Selection;
import com.ptit.music_be.service.collab.live.LiveSessionRegistry.Joined;

class LiveSessionRegistryTest {

    private static final Instant T0 = Instant.parse("2026-11-13T10:00:00Z");

    private final LiveSessionRegistry registry = new LiveSessionRegistry();

    private Joined join(String session, boolean editing) {
        return registry.upsert("s", session, session + "@mail", "m-" + session, session, editing, null, T0);
    }

    @Test
    void everyTabGetsItsOwnColor() {
        int a = join("A", true).participant().toMessage().colorIndex();
        int b = join("B", true).participant().toMessage().colorIndex();

        assertThat(a).isNotEqualTo(b);
    }

    @Test
    void eleventhEditorIsDeniedButTenViewersAreNot() {
        for (int i = 0; i < LiveSessionRegistry.MAX_EDITORS; i++) {
            assertThat(join("E" + i, true).fullDenied()).isFalse();
        }

        Joined denied = join("late", true);

        assertThat(denied.fullDenied()).isTrue();
        assertThat(denied.participant().editing()).isFalse();
        assertThat(registry.editorCount("s")).isEqualTo(LiveSessionRegistry.MAX_EDITORS);
        assertThat(join("watcher", false).participant().editing()).isFalse();
    }

    @Test
    void freedSlotCanBeTakenAgain() {
        for (int i = 0; i < LiveSessionRegistry.MAX_EDITORS; i++) {
            join("E" + i, true);
        }
        registry.remove("s", "E3");

        assertThat(join("late", true).fullDenied()).isFalse();
    }

    @Test
    void membersWithoutHeartbeatExpireAfterFortyFiveSeconds() {
        join("A", true);
        join("B", true);
        registry.upsert("s", "B", "B@mail", "m-B", "B", true, new Selection(0, 1, 2), T0.plusSeconds(40));

        var removed = registry.expire(T0.plusSeconds(46));

        assertThat(removed).extracting(r -> r.participant().sessionId()).containsExactly("A");
        assertThat(registry.participants("s")).hasSize(1);
    }

    @Test
    void disconnectRemovesTheSessionEverywhere() {
        registry.upsert("s1", "X", "x@mail", "m-x", "X", true, null, T0);
        registry.upsert("s2", "X", "x@mail", "m-x", "X", false, null, T0);

        var removed = registry.removeSession("X");

        assertThat(removed).hasSize(2);
        assertThat(registry.participants("s1")).isEmpty();
        assertThat(registry.participants("s2")).isEmpty();
    }

    @Test
    void activeScoresAreTrackedForTheSaveGuard() {
        assertThat(registry.isActive("s")).isFalse();
        registry.markActive("s");
        assertThat(registry.isActive("s")).isTrue();
        registry.markIdle("s");
        assertThat(registry.isActive("s")).isFalse();
    }

    @Test
    void opRateIsLimitedPerSecond() {
        LiveParticipant p = join("A", true).participant();

        boolean allowed = true;
        for (int i = 0; i < 20; i++) {
            allowed &= p.allowOp(T0, 20);
        }
        assertThat(allowed).isTrue();
        assertThat(p.allowOp(T0, 20)).isFalse();
        assertThat(p.allowOp(T0.plusSeconds(2), 20)).isTrue();
    }
}
