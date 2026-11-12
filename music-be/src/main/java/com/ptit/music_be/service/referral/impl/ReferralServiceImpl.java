package com.ptit.music_be.service.referral.impl;

import java.security.SecureRandom;
import java.time.LocalDateTime;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.response.referral.ReferralResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.event.RewardEarnedEvent;
import com.ptit.music_be.event.RewardReason;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.service.referral.ReferralService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class ReferralServiceImpl implements ReferralService {

    /** Bỏ các ký tự dễ nhầm (0/O, 1/I/L) để đọc mã qua điện thoại không sai. */
    static final String ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

    static final int CODE_LENGTH = 8;
    private static final int MAX_ATTEMPTS = 10;
    private static final SecureRandom RANDOM = new SecureRandom();

    MemberRepository memberRepository;
    ApplicationEventPublisher eventPublisher;

    @Override
    @Transactional
    public ReferralResponse mine() {
        Member me = memberRepository
                .findByEmailForUpdate(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
        if (me.getReferralCode() == null) {
            me.setReferralCode(newCode());
            memberRepository.save(me);
        }
        return ReferralResponse.builder()
                .code(me.getReferralCode())
                .invitedCount(memberRepository.countByReferredBy(me.getId()))
                .rewardedCount(memberRepository.countByReferredByAndReferralRewardedAtIsNotNull(me.getId()))
                .build();
    }

    @Override
    @Transactional
    public void onDigitized(Member member) {
        if (member == null || member.getId() == null) {
            return;
        }
        // Khóa dòng để hai tác vụ xong cùng lúc không cùng thưởng
        Member invitee = memberRepository.findByIdForUpdate(member.getId()).orElse(null);
        if (invitee == null || invitee.getReferredBy() == null || invitee.getReferralRewardedAt() != null) {
            return;
        }
        invitee.setReferralRewardedAt(LocalDateTime.now());
        memberRepository.save(invitee);
        eventPublisher.publishEvent(
                new RewardEarnedEvent(invitee.getReferredBy(), RewardReason.REFERRAL_DIGITIZED, invitee.getId()));
        eventPublisher.publishEvent(
                new RewardEarnedEvent(invitee.getId(), RewardReason.REFERRAL_WELCOME, invitee.getId()));
    }

    private String newCode() {
        for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            StringBuilder sb = new StringBuilder(CODE_LENGTH);
            for (int i = 0; i < CODE_LENGTH; i++) {
                sb.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
            }
            String code = sb.toString();
            if (!memberRepository.existsByReferralCode(code)) {
                return code;
            }
        }
        throw new IllegalStateException("Không sinh được mã giới thiệu không trùng");
    }
}
