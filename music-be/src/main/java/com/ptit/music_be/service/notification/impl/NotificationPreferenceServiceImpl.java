package com.ptit.music_be.service.notification.impl;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.notification.NotificationCategory;
import com.ptit.music_be.dto.enums.notification.NotificationType;
import com.ptit.music_be.dto.request.notification.NotificationPreferenceRequest;
import com.ptit.music_be.dto.response.notification.NotificationPreferenceResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.NotificationPreference;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.notification.NotificationPreferenceRepository;
import com.ptit.music_be.service.notification.NotificationPreferenceService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class NotificationPreferenceServiceImpl implements NotificationPreferenceService {

    NotificationPreferenceRepository preferenceRepository;
    MemberRepository memberRepository;

    @Override
    @Transactional(readOnly = true)
    public List<NotificationPreferenceResponse> getMine() {
        Member me = currentMember();
        return toResponses(preferenceRepository.findByMemberId(me.getId()));
    }

    @Override
    @Transactional
    public List<NotificationPreferenceResponse> updateMine(NotificationPreferenceRequest request) {
        Member me = currentMember();
        Map<NotificationCategory, NotificationPreference> existing = new EnumMap<>(NotificationCategory.class);
        preferenceRepository.findByMemberId(me.getId()).forEach(p -> existing.put(p.getCategory(), p));

        for (NotificationPreferenceRequest.Item item : request.getItems()) {
            if (item.getCategory() == NotificationCategory.SYSTEM) {
                throw new AppException(ErrorCode.NOTIFICATION_CATEGORY_LOCKED);
            }
            NotificationPreference pref = existing.get(item.getCategory());
            if (pref == null) {
                pref = NotificationPreference.builder()
                        .member(me)
                        .category(item.getCategory())
                        .build();
                existing.put(item.getCategory(), pref);
            }
            pref.setInApp(item.isInApp());
            pref.setEmail(item.isEmail());
            preferenceRepository.save(pref);
        }
        return toResponses(existing.values());
    }

    @Override
    @Transactional(readOnly = true)
    public Delivery deliveryFor(String memberId, NotificationType type) {
        NotificationCategory category = NotificationCategory.of(type);
        if (category == NotificationCategory.SYSTEM) {
            return Delivery.DEFAULT;
        }
        return preferenceRepository
                .findByMemberIdAndCategory(memberId, category)
                .map(p -> new Delivery(p.isInApp(), p.isEmail()))
                .orElse(Delivery.DEFAULT);
    }

    @Override
    @Transactional(readOnly = true)
    public Set<NotificationType> hiddenInAppTypes(String email) {
        Member me = memberRepository.findByEmail(email).orElse(null);
        if (me == null) {
            return Set.of();
        }
        Set<NotificationType> hidden = EnumSet.noneOf(NotificationType.class);
        for (NotificationPreference p : preferenceRepository.findByMemberId(me.getId())) {
            if (!p.isInApp()) {
                hidden.addAll(p.getCategory().types());
            }
        }
        return hidden;
    }

    @Override
    @Transactional(readOnly = true)
    public Set<NotificationCategory> emailCategories(String memberId) {
        return preferenceRepository.findByMemberId(memberId).stream()
                .filter(NotificationPreference::isEmail)
                .map(NotificationPreference::getCategory)
                .collect(Collectors.toCollection(() -> EnumSet.noneOf(NotificationCategory.class)));
    }

    private Member currentMember() {
        return memberRepository
                .findByEmail(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
    }

    /** Đủ mọi nhóm chỉnh được, theo thứ tự khai báo; nhóm chưa có hàng lấy mặc định. */
    private List<NotificationPreferenceResponse> toResponses(java.util.Collection<NotificationPreference> prefs) {
        Map<NotificationCategory, NotificationPreference> byCategory = new EnumMap<>(NotificationCategory.class);
        prefs.forEach(p -> byCategory.put(p.getCategory(), p));
        return NotificationCategory.configurable().stream()
                .map(c -> {
                    NotificationPreference p = byCategory.get(c);
                    return NotificationPreferenceResponse.builder()
                            .category(c)
                            .inApp(p == null ? Delivery.DEFAULT.inApp() : p.isInApp())
                            .email(p == null ? Delivery.DEFAULT.email() : p.isEmail())
                            .build();
                })
                .toList();
    }
}
