package com.ptit.music_be.service.payment.impl;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.enums.AppLocale;
import com.ptit.music_be.dto.enums.BillingPeriod;
import com.ptit.music_be.dto.enums.PaymentKind;
import com.ptit.music_be.dto.enums.PaymentProviderType;
import com.ptit.music_be.dto.enums.PaymentStatus;
import com.ptit.music_be.dto.enums.SubscriptionSource;
import com.ptit.music_be.dto.request.CreatePaymentOrderRequest;
import com.ptit.music_be.dto.response.PaymentOrderResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.PaymentOrder;
import com.ptit.music_be.entity.Plan;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.PaymentOrderRepository;
import com.ptit.music_be.repository.PlanRepository;
import com.ptit.music_be.dto.enums.NotificationType;
import com.ptit.music_be.service.billing.SubscriptionService;
import com.ptit.music_be.service.billing.impl.SubscriptionServiceImpl;
import com.ptit.music_be.service.notification.NotificationService;
import com.ptit.music_be.service.payment.PaymentProvider;
import com.ptit.music_be.service.payment.PaymentProvider.PaymentCallback;
import com.ptit.music_be.service.payment.PaymentProvider.PaymentContext;
import com.ptit.music_be.service.payment.PaymentService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
public class PaymentServiceImpl implements PaymentService {

    static final int ORDER_TTL_MINUTES = 15;

    private final PaymentOrderRepository orderRepository;
    private final PlanRepository planRepository;
    private final MemberRepository memberRepository;
    private final SubscriptionService subscriptionService;
    private final NotificationService notificationService;
    private final ObjectMapper objectMapper;
    private final Map<PaymentProviderType, PaymentProvider> providers;

    public PaymentServiceImpl(
            PaymentOrderRepository orderRepository,
            PlanRepository planRepository,
            MemberRepository memberRepository,
            SubscriptionService subscriptionService,
            NotificationService notificationService,
            ObjectMapper objectMapper,
            List<PaymentProvider> providerList) {
        this.orderRepository = orderRepository;
        this.planRepository = planRepository;
        this.memberRepository = memberRepository;
        this.subscriptionService = subscriptionService;
        this.notificationService = notificationService;
        this.objectMapper = objectMapper;
        this.providers = providerList.stream().collect(Collectors.toMap(PaymentProvider::type, Function.identity()));
    }

    @Override
    @Transactional
    public PaymentOrderResponse createOrder(CreatePaymentOrderRequest request, String clientIp) {
        PaymentProviderType type = request.getProvider() == null ? PaymentProviderType.VNPAY : request.getProvider();
        PaymentProvider provider = providers.get(type);
        if (provider == null || !provider.isConfigured()) {
            throw new AppException(ErrorCode.PAYMENT_PROVIDER_UNAVAILABLE);
        }
        if (request.getPeriod() == null) {
            throw new AppException(ErrorCode.PAYMENT_PERIOD_INVALID);
        }
        Plan plan = planRepository
                .findByCode(request.getPlanCode() == null ? "" : request.getPlanCode())
                .orElseThrow(() -> new AppException(ErrorCode.PLAN_NOT_EXISTED));
        long amount = request.getPeriod() == BillingPeriod.MONTH
                ? plan.getPriceMonth()
                : plan.getPriceYear();
        if (amount <= 0) {
            throw new AppException(ErrorCode.PAYMENT_PLAN_NOT_PURCHASABLE);
        }
        requirePurchaseNeeded(plan);
        Member member = memberRepository
                .findByEmail(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));

        PaymentOrder order = reuseOrSupersedePending(member, plan, request.getPeriod(), type);
        if (order == null) {
            order = orderRepository.save(PaymentOrder.builder()
                    .orderCode("MU" + UUID.randomUUID().toString().replace("-", "").substring(0, 16).toUpperCase())
                    .member(member)
                    .plan(plan)
                    .period(request.getPeriod())
                    .kind(isRenewal(member, plan) ? PaymentKind.RENEW : PaymentKind.NEW)
                    .amount(amount)
                    .provider(type)
                    .status(PaymentStatus.PENDING)
                    .expiresAt(LocalDateTime.now().plusMinutes(ORDER_TTL_MINUTES))
                    .build());
        }

        String locale = member.getLocale() == AppLocale.EN ? "en" : "vn";
        String payUrl = provider.createPayment(order, new PaymentContext(clientIp, locale))
                .payUrl();
        PaymentOrderResponse response = toResponse(order, false);
        response.setPayUrl(payUrl);
        return response;
    }

    /** SUPER_ADMIN không giới hạn nên không mua gói nào; ADMIN đã có Pro không thời hạn nên không mua Pro. */
    private static void requirePurchaseNeeded(Plan plan) {
        if (SecurityUtils.isSuperAdmin()
                || (SecurityUtils.isAdmin() && SubscriptionServiceImpl.PRO.equals(plan.getCode()))) {
            throw new AppException(ErrorCode.PAYMENT_NOT_NEEDED);
        }
    }

    /** Gia hạn khi người mua đang dùng đúng gói này (còn hạn); gói khác hoặc đang ở Free thì là mua mới. */
    private boolean isRenewal(Member member, Plan plan) {
        Plan current = subscriptionService.currentPlan(member.getId());
        return current != null && current.getId() != null && current.getId().equals(plan.getId());
    }

    /**
     * Người dùng bấm mua lại khi còn đơn PENDING còn hạn: dùng lại đơn cùng gói/chu kỳ/cổng (không tạo dòng thứ hai,
     * gia hạn thêm 15 phút); các đơn PENDING khác của họ coi như bỏ dở và chuyển EXPIRED (nếu cổng báo đã trả thì IPN
     * muộn vẫn bật gói). Trả null nếu không có đơn để dùng lại.
     */
    private PaymentOrder reuseOrSupersedePending(
            Member member, Plan plan, BillingPeriod period, PaymentProviderType type) {
        LocalDateTime now = LocalDateTime.now();
        PaymentOrder reuse = null;
        for (PaymentOrder o : orderRepository.findByMemberEmailOrderByCreatedAtDesc(member.getEmail())) {
            if (o.getStatus() != PaymentStatus.PENDING) {
                continue;
            }
            boolean same = o.getExpiresAt().isAfter(now)
                    && o.getPlan().getId().equals(plan.getId())
                    && o.getPeriod() == period
                    && o.getProvider() == type;
            if (same && reuse == null) {
                reuse = o;
            } else {
                o.setStatus(PaymentStatus.EXPIRED);
                orderRepository.save(o);
            }
        }
        if (reuse != null) {
            reuse.setExpiresAt(now.plusMinutes(ORDER_TTL_MINUTES));
            orderRepository.save(reuse);
        }
        return reuse;
    }

    @Override
    @Transactional
    public PaymentOrderResponse resumeOrder(String orderCode, String clientIp) {
        PaymentOrder order =
                orderRepository.findByOrderCodeForUpdate(orderCode).orElseThrow(this::notFound);
        if (!order.getMember().getEmail().equals(SecurityUtils.getCurrentEmail())) {
            throw notFound();
        }
        PaymentProvider provider = providers.get(order.getProvider());
        if (provider == null || !provider.isConfigured()) {
            throw new AppException(ErrorCode.PAYMENT_PROVIDER_UNAVAILABLE);
        }
        if (order.getStatus() != PaymentStatus.PENDING || !order.getExpiresAt().isAfter(LocalDateTime.now())) {
            throw new AppException(ErrorCode.PAYMENT_ORDER_NOT_PAYABLE);
        }
        requirePurchaseNeeded(order.getPlan());
        order.setExpiresAt(LocalDateTime.now().plusMinutes(ORDER_TTL_MINUTES));
        orderRepository.save(order);
        String locale = order.getMember().getLocale() == AppLocale.EN ? "en" : "vn";
        PaymentOrderResponse response = toResponse(order, false);
        response.setPayUrl(provider.createPayment(order, new PaymentContext(clientIp, locale)).payUrl());
        return response;
    }

    @Override
    @Transactional(readOnly = true)
    public PaymentOrderResponse getMyOrder(String orderCode) {
        PaymentOrder order =
                orderRepository.findByOrderCode(orderCode).orElseThrow(this::notFound);
        // Đơn của người khác coi như không tồn tại
        if (!order.getMember().getEmail().equals(SecurityUtils.getCurrentEmail())) {
            throw notFound();
        }
        return toResponse(order, false);
    }

    @Override
    @Transactional(readOnly = true)
    public List<PaymentOrderResponse> listMyOrders() {
        LocalDateTime now = LocalDateTime.now();
        // Đơn bỏ dở (hết hạn chưa trả) không đưa vào lịch sử để khỏi thành nhiều dòng trùng
        return orderRepository.findByMemberEmailOrderByCreatedAtDesc(SecurityUtils.getCurrentEmail()).stream()
                .filter(o -> o.getStatus() != PaymentStatus.EXPIRED
                        && !(o.getStatus() == PaymentStatus.PENDING && !o.getExpiresAt().isAfter(now)))
                .map(o -> toResponse(o, false))
                .toList();
    }

    @Override
    @Transactional
    public PaymentOrderResponse confirmReturn(PaymentProviderType type, Map<String, String> params) {
        IpnResult result = handleIpn(type, params);
        if (result == IpnResult.INVALID_SIGNATURE || result == IpnResult.ORDER_NOT_FOUND) {
            throw notFound();
        }
        return getMyOrder(params.getOrDefault("vnp_TxnRef", ""));
    }

    @Override
    @Transactional
    public IpnResult handleIpn(PaymentProviderType type, Map<String, String> params) {
        PaymentProvider provider = providers.get(type);
        if (provider == null) {
            return IpnResult.INVALID_SIGNATURE;
        }
        PaymentCallback callback = provider.parseCallback(params);
        if (!callback.validSignature()) {
            log.warn("IPN {} sai chữ ký, bỏ qua", type);
            return IpnResult.INVALID_SIGNATURE;
        }
        PaymentOrder order = orderRepository
                .findByOrderCodeForUpdate(callback.orderCode() == null ? "" : callback.orderCode())
                .orElse(null);
        if (order == null) {
            return IpnResult.ORDER_NOT_FOUND;
        }
        if (order.getAmount() != callback.amount()) {
            log.warn("IPN đơn {} sai số tiền: đơn {} nhưng cổng báo {}", order.getOrderCode(), order.getAmount(), callback.amount());
            return IpnResult.INVALID_AMOUNT;
        }
        if (order.getStatus() == PaymentStatus.PAID || order.getStatus() == PaymentStatus.REFUNDED) {
            return IpnResult.ALREADY_CONFIRMED;
        }

        applyResult(order, callback, toJson(params));
        return IpnResult.OK;
    }

    /** Ghi kết quả đã xác thực của cổng vào đơn: thành công thì PAID và bật gói, thất bại thì PENDING → FAILED. */
    private void applyResult(PaymentOrder order, PaymentCallback callback, String rawPayload) {
        order.setRawPayload(rawPayload);
        if (callback.success()) {
            // Đơn đã hết hạn/lỗi mà cổng vẫn báo tiền đã về thì vẫn bật gói: tiền đã nhận
            order.setStatus(PaymentStatus.PAID);
            order.setProviderTxnId(callback.providerTxnId());
            order.setPaidAt(LocalDateTime.now());
            orderRepository.save(order);
            subscriptionService.activate(
                    order.getMember(), order.getPlan(), order.getPeriod().duration(), SubscriptionSource.PAYMENT);
            notificationService.notify(
                    order.getMember(),
                    null,
                    NotificationType.PLAN_ACTIVATED,
                    null,
                    "Thanh toán thành công, gói " + order.getPlan().getName() + " đã được kích hoạt",
                    NotificationService.params("plan", order.getPlan().getName(), "orderCode", order.getOrderCode()));
        } else {
            if (order.getStatus() == PaymentStatus.PENDING) {
                order.setStatus(PaymentStatus.FAILED);
            }
            orderRepository.save(order);
        }
    }

    @Override
    @Transactional
    public int expirePending() {
        List<PaymentOrder> due =
                orderRepository.findByStatusAndExpiresAtBefore(PaymentStatus.PENDING, LocalDateTime.now());
        int closed = 0;
        for (PaymentOrder candidate : due) {
            // Khóa dòng rồi đọc lại: IPN có thể vừa xử lý xong đơn này
            PaymentOrder order = orderRepository
                    .findByOrderCodeForUpdate(candidate.getOrderCode())
                    .orElse(null);
            if (order == null || order.getStatus() != PaymentStatus.PENDING) {
                continue;
            }
            PaymentProvider provider = providers.get(order.getProvider());
            Optional<PaymentCallback> answer = provider == null ? Optional.empty() : provider.queryTransaction(order);
            if (answer.isPresent()
                    && answer.get().validSignature()
                    && order.getOrderCode().equals(answer.get().orderCode())
                    && order.getAmount() == answer.get().amount()) {
                applyResult(order, answer.get(), null);
                log.info("Đối soát đơn {}: cổng báo {}", order.getOrderCode(), answer.get().success() ? "đã trả tiền" : "thất bại");
                if (order.getStatus() == PaymentStatus.PAID) {
                    continue;
                }
            }
            if (order.getStatus() == PaymentStatus.PENDING) {
                order.setStatus(PaymentStatus.EXPIRED);
                orderRepository.save(order);
            }
            closed++;
        }
        return closed;
    }

    public static PaymentOrderResponse toResponse(PaymentOrder o, boolean withEmail) {
        return PaymentOrderResponse.builder()
                .id(o.getId())
                .orderCode(o.getOrderCode())
                .planCode(o.getPlan().getCode())
                .planName(o.getPlan().getName())
                .period(o.getPeriod().name())
                .kind(o.getKind().name())
                .amount(o.getAmount())
                .provider(o.getProvider().name())
                .status(o.getStatus().name())
                .createdAt(o.getCreatedAt())
                .expiresAt(o.getExpiresAt())
                .paidAt(o.getPaidAt())
                .memberEmail(withEmail ? o.getMember().getEmail() : null)
                .build();
    }

    private AppException notFound() {
        return new AppException(ErrorCode.PAYMENT_ORDER_NOT_EXISTED);
    }

    private String toJson(Map<String, String> params) {
        try {
            return objectMapper.writeValueAsString(params);
        } catch (JsonProcessingException e) {
            return null;
        }
    }
}
