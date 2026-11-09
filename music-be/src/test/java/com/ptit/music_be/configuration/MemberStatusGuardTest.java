package com.ptit.music_be.configuration;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.ptit.music_be.dto.enums.MemberStatus;
import com.ptit.music_be.repository.MemberRepository;

class MemberStatusGuardTest {

    private final MemberRepository repo = mock(MemberRepository.class);
    private final MemberStatusGuard guard = new MemberStatusGuard(repo);

    @Test
    void lockedMemberIsLockedAndActiveIsNot() {
        when(repo.findStatusByEmail("bad@x.com")).thenReturn(Optional.of(MemberStatus.INACTIVE));
        when(repo.findStatusByEmail("ok@x.com")).thenReturn(Optional.of(MemberStatus.ACTIVE));

        assertTrue(guard.isLocked("bad@x.com"));
        assertFalse(guard.isLocked("ok@x.com"));
    }

    @Test
    void unknownMemberOrNullEmailIsNotTreatedAsLocked() {
        when(repo.findStatusByEmail("ghost@x.com")).thenReturn(Optional.empty());

        assertFalse(guard.isLocked("ghost@x.com"));
        assertFalse(guard.isLocked(null));
    }

    @Test
    void resultIsCachedUntilEvicted() {
        when(repo.findStatusByEmail("a@x.com")).thenReturn(Optional.of(MemberStatus.ACTIVE));

        assertFalse(guard.isLocked("a@x.com"));
        assertFalse(guard.isLocked("a@x.com"));
        verify(repo, times(1)).findStatusByEmail("a@x.com");

        // admin khóa: evict rồi hỏi lại phải thấy trạng thái mới ngay
        when(repo.findStatusByEmail("a@x.com")).thenReturn(Optional.of(MemberStatus.INACTIVE));
        guard.evict("a@x.com");
        assertTrue(guard.isLocked("a@x.com"));
    }
}
