package com.ptit.music_be.service.collab.live;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.ptit.music_be.service.collab.live.MeasureLockManager.Grant;
import com.ptit.music_be.service.collab.live.MeasureLockManager.Key;

class MeasureLockManagerTest {

    private static final Instant T0 = Instant.parse("2026-11-13T10:00:00Z");
    private static final Key M3 = new Key(0, 2);
    private static final Key M4 = new Key(0, 3);

    private final MeasureLockManager locks = new MeasureLockManager();

    @Test
    void secondPersonCannotTakeAHeldMeasure() {
        assertThat(locks.acquire("s", "A", List.of(M3), false, T0).granted()).isTrue();

        Grant grant = locks.acquire("s", "B", List.of(M3, M4), false, T0);

        assertThat(grant.granted()).isFalse();
        assertThat(grant.heldBy()).isEqualTo("A");
        // Tất cả hoặc không: ô 4 còn trống nhưng không được cấp vì ô 3 bị chặn
        assertThat(locks.holds("s", "B", List.of(M4), false, T0)).isFalse();
    }

    @Test
    void sameSessionCanReacquireAndOthersTakeFreeMeasures() {
        locks.acquire("s", "A", List.of(M3), false, T0);

        assertThat(locks.acquire("s", "A", List.of(M3), false, T0).granted()).isTrue();
        assertThat(locks.acquire("s", "B", List.of(M4), false, T0).granted()).isTrue();
    }

    @Test
    void wholeScoreNeedsNoOtherLocksAndBlocksEveryoneElse() {
        locks.acquire("s", "A", List.of(M3), false, T0);

        Grant blocked = locks.acquire("s", "B", List.of(), true, T0);
        assertThat(blocked.granted()).isFalse();
        assertThat(blocked.heldBy()).isEqualTo("A");

        locks.releaseAll("s", "A");
        assertThat(locks.acquire("s", "B", List.of(), true, T0).granted()).isTrue();
        assertThat(locks.acquire("s", "A", List.of(M4), false, T0).granted()).isFalse();
        assertThat(locks.holds("s", "B", List.of(M3), false, T0)).isTrue();
    }

    @Test
    void locksExpireAfterSixtySecondsUnlessRenewed() {
        locks.acquire("s", "A", List.of(M3), false, T0);
        locks.acquire("s", "B", List.of(M4), false, T0);

        locks.renew("s", "A", T0.plusSeconds(50));
        Instant later = T0.plusSeconds(61);

        assertThat(locks.holds("s", "A", List.of(M3), false, later)).isTrue();
        assertThat(locks.holds("s", "B", List.of(M4), false, later)).isFalse();
        assertThat(locks.expire(later)).contains("s");
        assertThat(locks.acquire("s", "C", List.of(M4), false, later).granted()).isTrue();
    }

    @Test
    void releaseOnlyAffectsOwnLocks() {
        locks.acquire("s", "A", List.of(M3), false, T0);

        assertThat(locks.release("s", "B", List.of(M3), false)).isFalse();
        assertThat(locks.release("s", "A", List.of(M3), false)).isTrue();
        assertThat(locks.snapshot("s", T0).locks()).isEmpty();
    }

    @Test
    void snapshotListsHoldersSortedByPosition() {
        locks.acquire("s", "B", List.of(M4), false, T0);
        locks.acquire("s", "A", List.of(M3), false, T0);

        var snapshot = locks.snapshot("s", T0);

        assertThat(snapshot.wholeHolder()).isNull();
        assertThat(snapshot.locks()).extracting("measureIndex", "sessionId").containsExactly(
                org.assertj.core.groups.Tuple.tuple(2, "A"), org.assertj.core.groups.Tuple.tuple(3, "B"));
    }
}
