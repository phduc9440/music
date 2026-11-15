import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { Link } from '../../routes/transition-nav';
import { billingApi } from '../../services';
import type { BillingPeriod, HeldSubscription, MySubscription, PaymentOrder } from '../../types';
import { formatDate, formatDateTime, formatNumber, formatVnd, t, translateError } from '../../i18n/core';
import Skeleton from '../../components/ui/Skeleton';
import LimitList from './LimitList';
import PaymentCountdown from './PaymentCountdown';
import '../../components/scores/scores.css';
import './billing.css';

const PERIODS: BillingPeriod[] = ['MONTH', 'YEAR'];
/** Còn từ chừng này ngày trở xuống thì nhắc gói sắp hết hạn. */
const EXPIRING_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Hạn mới sau khi gia hạn: cộng 1 tháng / 1 năm vào ngày hết hạn hiện tại, giống Period.plus ở backend (31/1 + 1 tháng
 * = 28 hoặc 29/2, không tràn sang tháng 3 như Date.setMonth).
 */
function extendDate(iso: string, period: BillingPeriod): Date {
  const d = new Date(iso);
  const months = period === 'MONTH' ? 1 : 12;
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1, d.getHours(), d.getMinutes());
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), lastDay));
  return target;
}

/**
 * Một gói đã đăng ký (cá nhân hoặc team): hạn, nguồn, lệnh cấm và phần gia hạn riêng. Gia hạn tạo đơn cùng gói (backend
 * ghi là RENEW, thanh toán xong cộng thêm vào ngày hết hạn của đúng gói này, gói kia giữ nguyên).
 */
function SubscriptionCard({ held, loadedAt }: { held: HeldSubscription; loadedAt: number }) {
  const { plan } = held;
  const [period, setPeriod] = useState<BillingPeriod>(plan.priceMonth > 0 ? 'MONTH' : 'YEAR');
  const [renewing, setRenewing] = useState(false);
  const daysLeft = Math.max(0, Math.ceil((new Date(held.expiresAt).getTime() - loadedAt) / DAY_MS));
  const price = period === 'MONTH' ? plan.priceMonth : plan.priceYear;
  const canRenew = !held.banned && plan.priceMonth + plan.priceYear > 0;

  const renew = async () => {
    setRenewing(true);
    try {
      const res = await billingApi.createOrder({ planCode: plan.code, period });
      if (res.data.result.payUrl) window.location.assign(res.data.result.payUrl);
      else setRenewing(false);
    } catch (error) {
      toast.error(translateError(error, t('billing.pricing.buyFailed')));
      setRenewing(false);
    }
  };

  const titleId = `bl-sub-${plan.code}`;
  return (
    <section className="bl-card" aria-labelledby={titleId}>
      <div className="bl-card__head">
        <h3 id={titleId}>{plan.name}</h3>
        <span className="bl-badge">{t(`billing.audience.${plan.audience}`)}</span>
      </div>
      <p>
        {t('billing.myPlan.expires', { date: formatDate(held.expiresAt) })} · {t(`billing.source.${held.source}`)}
      </p>
      {held.banned && <p className="bl-note bl-note--danger">{t('billing.myPlan.bannedPlan')}</p>}
      {canRenew && (
        <div className="bl-renew">
          <h4>{t('billing.myPlan.renewTitle')}</h4>
          {daysLeft <= EXPIRING_DAYS && (
            <p className="bl-note bl-note--warning" role="status">
              {daysLeft === 0
                ? t('billing.myPlan.expiresToday')
                : t('billing.myPlan.expiringSoon', { count: daysLeft })}
            </p>
          )}
          <div className="bl-period" role="group" aria-label={t('billing.pricing.period')}>
            {PERIODS.filter((p) => (p === 'MONTH' ? plan.priceMonth : plan.priceYear) > 0).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={period === p}
                className={`sc-btn sc-btn--sm${period === p ? ' sc-btn--primary' : ''}`}
                onClick={() => setPeriod(p)}
              >
                {t(`billing.period.${p}`)}
              </button>
            ))}
          </div>
          {price > 0 && (
            <p className="bl-renew__summary">
              {t('billing.myPlan.renewSummary', {
                period: t(`billing.periodUnit.${period}`),
                amount: formatVnd(price),
                date: formatDate(extendDate(held.expiresAt, period)),
              })}
            </p>
          )}
          {price > 0 && (
            <div className="bl-actions">
              <button type="button" className="sc-btn sc-btn--primary" disabled={renewing} onClick={renew}>
                {renewing
                  ? t('billing.pricing.redirecting')
                  : t('billing.myPlan.renew', { period: t(`billing.periodUnit.${period}`) })}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Trang /billing "Gói của tôi" (mục 7.3): các gói đã đăng ký (tối đa một gói cá nhân và một gói team, mỗi gói có hạn và
 * nút gia hạn riêng), hạn mức đang áp dụng (gộp từ các gói) và lịch sử thanh toán.
 */
export default function MyPlan() {
  const [sub, setSub] = useState<MySubscription | null>(null);
  const [orders, setOrders] = useState<PaymentOrder[] | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  // Thời điểm tải để tính số ngày còn lại của từng gói (không gọi Date.now khi render)
  const [loadedAt, setLoadedAt] = useState(0);

  useEffect(() => {
    billingApi
      .mine()
      .then((res) => {
        setSub(res.data.result);
        setLoadedAt(Date.now());
      })
      .catch(() => toast.error(t('billing.loadFailed')));
    billingApi
      .myOrders()
      .then((res) => setOrders(res.data.result))
      .catch(() => setOrders([]));
  }, []);

  // Đơn đang chờ: lấy lại link thanh toán rồi chuyển sang cổng
  const payAgain = async (order: PaymentOrder) => {
    setPaying(order.orderCode);
    try {
      const res = await billingApi.resumeOrder(order.orderCode);
      if (res.data.result.payUrl) window.location.assign(res.data.result.payUrl);
    } catch (error) {
      toast.error(translateError(error, t('billing.history.payFailed')));
      setPaying(null);
    }
  };

  // Tổng đã chi: cộng các đơn đã thanh toán trong lịch sử (API trả đủ mọi đơn, không phân trang); đơn đã hoàn tách riêng
  const spent = useMemo(() => {
    const paid = (orders ?? []).filter((o) => o.status === 'PAID');
    const refunded = (orders ?? []).filter((o) => o.status === 'REFUNDED');
    return {
      total: paid.reduce((sum, o) => sum + o.amount, 0),
      count: paid.length,
      refundedTotal: refunded.reduce((sum, o) => sum + o.amount, 0),
      refundedCount: refunded.length,
    };
  }, [orders]);

  const held = sub?.subscriptions ?? [];
  // Hạn mức gộp từ mọi gói; backend cũ chưa trả limits thì dùng hạn mức của gói chính
  const limits = sub ? (sub.limits ?? sub.plan.limits) : null;
  const limit = limits?.omrPagesPerMonth;
  const percent = sub && limit ? Math.min(100, Math.round((sub.omrPagesUsed * 100) / limit)) : 0;
  // Quyền lợi không đến từ gói mua/được cấp: Free, Pro theo vai trò ADMIN, không giới hạn của SUPER_ADMIN
  const roleOrFree = sub && (sub.status !== 'ACTIVE' || sub.source === 'ROLE');

  return (
    <div className="sc-page">
      <main className="sc-container">
        <header className="sc-lib-head">
          <div>
            <h1>{t('billing.myPlan.title')}</h1>
            <p>{t('billing.myPlan.subtitle')}</p>
          </div>
        </header>

        {!sub && <Skeleton lines={5} />}
        {sub && (
          <>
            {sub.bans?.map((b) => (
              <p key={b.planCode} className="bl-note bl-note--danger" role="alert">
                {t('billing.banned', { plan: b.planName, date: formatDate(b.until) })}
              </p>
            ))}

            <section className="bl-group" aria-labelledby="bl-held-title">
              <h2 id="bl-held-title" className="bl-group__title">
                {t('billing.myPlan.heldTitle')}
              </h2>
              <p className="bl-group__desc">{t('billing.myPlan.heldDesc')}</p>
              <div className="bl-grid">
                {roleOrFree && (
                  <section className="bl-card">
                    <div className="bl-card__head">
                      <h3>{sub.status === 'UNLIMITED' ? t('billing.unlimitedPlan') : sub.plan.name}</h3>
                      <span className="bl-badge">{t(`billing.status.${sub.status}`)}</span>
                    </div>
                    {sub.source === 'ROLE' && sub.roleGrant && <p>{t(`billing.myPlan.roleGrant.${sub.roleGrant}`)}</p>}
                    {sub.status === 'FREE' && <p>{t('billing.myPlan.freeNote')}</p>}
                  </section>
                )}
                {held.map((h) => (
                  <SubscriptionCard key={h.plan.code} held={h} loadedAt={loadedAt} />
                ))}
              </div>
              <div className="bl-actions">
                <Link className={`sc-btn${held.length === 0 ? ' sc-btn--primary' : ''}`} to="/pricing">
                  {held.length < 2 && sub.status !== 'UNLIMITED'
                    ? t('billing.myPlan.addPlan')
                    : t('billing.myPlan.viewPlans')}
                </Link>
              </div>
            </section>

            {limits && (
              <section className="bl-card" aria-labelledby="bl-limits-title">
                <div className="bl-card__head">
                  <h2 id="bl-limits-title">{t('billing.myPlan.limitsTitle')}</h2>
                </div>
                {held.length > 1 && <p className="bl-note">{t('billing.myPlan.mergedNote')}</p>}
                <div className="bl-meter">
                  <div className="bl-meter__label">
                    <span>{t('billing.myPlan.omrUsed')}</span>
                    <strong>
                      {limit == null
                        ? t('billing.myPlan.usedUnlimited', { used: formatNumber(sub.omrPagesUsed) })
                        : `${formatNumber(sub.omrPagesUsed)} / ${formatNumber(limit)}`}
                    </strong>
                  </div>
                  {limit != null && (
                    <div className="sc-progress sc-progress--wide" role="progressbar" aria-valuenow={percent}>
                      <div className="sc-progress__bar" style={{ width: `${percent}%` }} />
                    </div>
                  )}
                </div>
                <LimitList limits={limits} />
              </section>
            )}
          </>
        )}

        <section className="bl-card" aria-labelledby="bl-history-title">
          <div className="bl-card__head">
            <h2 id="bl-history-title">{t('billing.history.title')}</h2>
          </div>
          {orders && orders.length > 0 && (
            <div className="bl-spent">
              <span className="bl-spent__label">{t('billing.history.spent')}</span>
              <strong className="bl-spent__value">{formatVnd(spent.total)}</strong>
              <span className="bl-spent__hint">
                {t('billing.history.spentOrders', { count: spent.count })}
                {spent.refundedCount > 0 &&
                  ` · ${t('billing.history.spentRefunded', { amount: formatVnd(spent.refundedTotal), count: spent.refundedCount })}`}
              </span>
            </div>
          )}
          {!orders && <Skeleton lines={3} />}
          {orders && orders.length === 0 && <p>{t('billing.history.empty')}</p>}
          {orders && orders.length > 0 && (
            <ul className="bl-orders">
              {orders.map((o) => (
                <li key={o.id} className={`bl-order bl-order--${o.status.toLowerCase()}`}>
                  <div className="bl-order__head">
                    <strong>
                      {t(`billing.kind.${o.kind}`)} · {o.planName} · {t(`billing.period.${o.period}`)}
                    </strong>
                    <span className="bl-badge">{t(`billing.result.status.${o.status}`)}</span>
                  </div>
                  <dl className="bl-order__info">
                    <div>
                      <dt>{t('billing.result.amount')}</dt>
                      <dd>{formatVnd(o.amount)}</dd>
                    </div>
                    <div>
                      <dt>{t('billing.history.provider')}</dt>
                      <dd>{t(`billing.provider.${o.provider}`)}</dd>
                    </div>
                    <div>
                      <dt>{t('billing.history.createdAt')}</dt>
                      <dd>{formatDateTime(o.createdAt)}</dd>
                    </div>
                    {o.paidAt && (
                      <div>
                        <dt>{t('billing.result.paidAt')}</dt>
                        <dd>{formatDateTime(o.paidAt)}</dd>
                      </div>
                    )}
                    <div>
                      <dt>{t('billing.history.orderCode')}</dt>
                      <dd>{o.orderCode}</dd>
                    </div>
                  </dl>
                  {o.status === 'PENDING' && (
                    <div className="bl-order__pending">
                      <p>
                        {t('billing.history.pendingNote', {
                          kind: t(`billing.kind.${o.kind}`).toLowerCase(),
                          plan: o.planName,
                          period: t(`billing.periodUnit.${o.period}`),
                          amount: formatVnd(o.amount),
                          time: formatDateTime(o.expiresAt),
                        })}
                      </p>
                      <PaymentCountdown
                        expiresAt={o.expiresAt}
                        onExpire={() => setOrders((list) => list?.filter((x) => x.id !== o.id) ?? null)}
                      />
                      <button
                        type="button"
                        className="sc-btn sc-btn--primary"
                        disabled={paying === o.orderCode}
                        onClick={() => payAgain(o)}
                      >
                        {paying === o.orderCode ? t('billing.pricing.redirecting') : t('billing.history.pay')}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
