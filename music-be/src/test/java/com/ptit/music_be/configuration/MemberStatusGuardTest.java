package com.ptit.music_be.configuration;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.ptit.music_be.dto.enums.auth.MemberStatus;
import com.ptit.music_be.repository.auth.MemberRepository;

class MemberStatusGuardTest {

    private final MemberRepository repo = mock(MemberRepository.class);
    private final MemberStatusGuard guard = new MemberStatusGuard(repo);

    private static MemberRepository.AuthState state(MemberStatus status, LocalDateTime changedAt) {
        return new MemberRepository.AuthState() {
            @Override
            public MemberStatus getStatus() {
                return status;
            }

            @Override
            public LocalDateTime getPasswordChangedAt() {
                return changedAt;
            }
        };
    }

    @Test
    void lockedMemberIsLockedAndActiveIsNot() {
        when(repo.findAuthStateByEmail("bad@x.com")).thenReturn(Optional.of(state(MemberStatus.INACTIVE, null)));
        when(repo.findAuthStateByEmail("ok@x.com")).thenReturn(Optional.of(state(MemberStatus.ACTIVE, null)));

        assertTrue(guard.isLocked("bad@x.com"));
        assertTrue(guard.isRejected("bad@x.com", Instant.now()));
        assertFalse(guard.isLocked("ok@x.com"));
        assertFalse(guard.isRejected("ok@x.com", Instant.now()));
    }

    @Test
    void unknownMemberOrNullEmailIsNotTreatedAsLocked() {
        when(repo.findAuthStateByEmail("ghost@x.com")).thenReturn(Optional.empty());

        assertFalse(guard.isLocked("ghost@x.com"));
        assertFalse(guard.isRejected("ghost@x.com", Instant.now()));
        assertFalse(guard.isLocked(null));
    }

    @Test
    void tokensIssuedBeforePasswordChangeAreRejected() {
        LocalDateTime changedAt = LocalDateTime.of(2026, 11, 10, 8, 0, 0);
        Instant changed = changedAt.atZone(ZoneId.systemDefault()).toInstant();
        when(repo.findAuthStateByEmail("a@x.com")).thenReturn(Optional.of(state(MemberStatus.ACTIVE, changedAt)));

        assertTrue(guard.isRejected("a@x.com", changed.minusSeconds(1)));
        assertFalse(guard.isRejected("a@x.com", changed)); // cùng giây: token mới cấp ngay sau khi đổi vẫn hợp lệ
        assertFalse(guard.isRejected("a@x.com", changed.plusSeconds(30)));
        assertTrue(guard.isRejected("a@x.com", null)); // không có iat thì coi như token cũ
    }

    @Test
    void resultIsCachedUntilEvicted() {
        when(repo.findAuthStateByEmail("a@x.com")).thenReturn(Optional.of(state(MemberStatus.ACTIVE, null)));

        assertFalse(guard.isLocked("a@x.com"));
        assertFalse(guard.isLocked("a@x.com"));
        verify(repo, times(1)).findAuthStateByEmail("a@x.com");

        // admin khóa hoặc người dùng đổi mật khẩu: evict rồi hỏi lại phải thấy trạng thái mới ngay
        when(repo.findAuthStateByEmail("a@x.com")).thenReturn(Optional.of(state(MemberStatus.INACTIVE, null)));
        guard.evict("a@x.com");
        assertTrue(guard.isLocked("a@x.com"));
    }
}
