package com.ptit.music_be.service.referral.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.entity.Member;
import com.ptit.music_be.event.RewardEarnedEvent;
import com.ptit.music_be.event.RewardReason;
import com.ptit.music_be.repository.MemberRepository;

class ReferralServiceImplTest {

    private final MemberRepository members = mock(MemberRepository.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final ReferralServiceImpl service = new ReferralServiceImpl(members, events);

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void firstCallGeneratesReadableCodeAndKeepsIt() {
        Member me = Member.builder().id("me").email("me@x.com").build();
        SecurityContextHolder.getContext()
                .setAuthentication(new UsernamePasswordAuthenticationToken("me@x.com", null, List.of()));
        when(members.findByEmailForUpdate("me@x.com")).thenReturn(Optional.of(me));
        when(members.countByReferredBy("me")).thenReturn(3L);
        when(members.countByReferredByAndReferralRewardedAtIsNotNull("me")).thenReturn(1L);

        var first = service.mine();

        assertNotNull(first.getCode());
        assertEquals(ReferralServiceImpl.CODE_LENGTH, first.getCode().length());
        assertTrue(first.getCode().chars().allMatch(c -> ReferralServiceImpl.ALPHABET.indexOf(c) >= 0));
        assertEquals(3, first.getInvitedCount());
        assertEquals(1, first.getRewardedCount());
        assertEquals(first.getCode(), service.mine().getCode());
    }

    @Test
    void invitedMemberDigitizingRewardsBothSidesOnce() {
        Member invitee = Member.builder().id("new").referredBy("inviter").build();
        when(members.findByIdForUpdate("new")).thenReturn(Optional.of(invitee));

        service.onDigitized(invitee);

        verify(events).publishEvent(new RewardEarnedEvent("inviter", RewardReason.REFERRAL_DIGITIZED, "new"));
        verify(events).publishEvent(new RewardEarnedEvent("new", RewardReason.REFERRAL_WELCOME, "new"));
        assertNotNull(invitee.getReferralRewardedAt());
    }

    @Test
    void alreadyRewardedOrNotInvitedGivesNothing() {
        Member rewarded = Member.builder().id("a").referredBy("inviter").referralRewardedAt(LocalDateTime.now()).build();
        Member selfJoined = Member.builder().id("b").build();
        when(members.findByIdForUpdate("a")).thenReturn(Optional.of(rewarded));
        when(members.findByIdForUpdate("b")).thenReturn(Optional.of(selfJoined));

        service.onDigitized(rewarded);
        service.onDigitized(selfJoined);

        verify(events, never()).publishEvent(any(Object.class));
    }
}
