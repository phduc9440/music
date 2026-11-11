import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Link } from '../../routes/transition-nav';
import { billingApi } from '../../services';
import type { BillingPeriod, MySubscription, PaymentOrder } from '../../types';
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

/** Trang /billing "Gói của tôi": gói đang dùng, ngày hết hạn và hạn mức đã dùng trong tháng (mục 7.3). */
export default function MyPlan() {
  const [sub, setSub] = useState<MySubscription | null>(null);
  const [orders, setOrders] = useState<PaymentOrder[] | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [renewPeriod, setRenewPeriod] = useState<BillingPeriod>('MONTH');
  const [renewing, setRenewing] = useState(false);
  // Số ngày còn lại của gói, tính một lần lúc tải (không gọi Date.now khi render)
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  useEffect(() => {
    billingApi
      .mine()
      .then((res) => {
        const result = res.data.result;
        setSub(result);
        setDaysLeft(
          result.expiresAt
            ? Math.max(0, Math.ceil((new Date(result.expiresAt).getTime() - Date.now()) / DAY_MS))
            : null,
        );
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

  // Gia hạn đúng gói đang dùng: tạo đơn cùng gói (backend ghi là RENEW, thanh toán xong cộng thêm vào ngày hết hạn)
  const renew = async () => {
    if (!sub) return;
    setRenewing(true);
    try {
      const res = await billingApi.createOrder({ planCode: sub.plan.code, period: renewPeriod });
      if (res.data.result.payUrl) window.location.assign(res.data.result.payUrl);
      else setRenewing(false);
    } catch (error) {
      toast.error(translateError(error, t('billing.pricing.buyFailed')));
      setRenewing(false);
    }
  };

  // Chỉ gia hạn được gói mua/được cấp/dùng thử còn hạn và có giá; quyền lợi theo vai trò quản trị thì không hết hạn
  const canRenew =
    !!sub &&
    sub.status === 'ACTIVE' &&
    sub.source !== 'ROLE' &&
    !!sub.expiresAt &&
    sub.plan.priceMonth + sub.plan.priceYear > 0;
  const renewBan = sub?.bans?.find((b) => b.planCode === sub.plan.code);
  const renewPrice = sub ? (renewPeriod === 'MONTH' ? sub.plan.priceMonth : sub.plan.priceYear) : 0;

  const limit = sub?.plan.limits.omrPagesPerMonth;
  const percent = sub && limit ? Math.min(100, Math.round((sub.omrPagesUsed * 100) / limit)) : 0;

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
          <section className="bl-card">
            <div className="bl-card__head">
              <h2>{sub.status === 'UNLIMITED' ? t('billing.unlimitedPlan') : sub.plan.name}</h2>
              <span className="bl-badge">{t(`billing.status.${sub.status}`)}</span>
            </div>
            {sub.bans?.map((b) => (
              <p key={b.planCode} className="bl-note bl-note--danger" role="alert">
                {t('billing.banned', { plan: b.planName, date: formatDate(b.until) })}
              </p>
            ))}
            {sub.source === 'ROLE' && sub.roleGrant && <p>{t(`billing.myPlan.roleGrant.${sub.roleGrant}`)}</p>}
            {sub.expiresAt && (
              <p>
                {t('billing.myPlan.expires', { date: formatDate(sub.expiresAt) })}
                {sub.source ? ` · ${t(`billing.source.${sub.source}`)}` : ''}
              </p>
            )}
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
            <LimitList limits={sub.plan.limits} />
            {canRenew && (
              <div className="bl-renew" aria-labelledby="bl-renew-title">
                <h3 id="bl-renew-title">{t('billing.myPlan.renewTitle')}</h3>
                {daysLeft != null && daysLeft <= EXPIRING_DAYS && (
                  <p className="bl-note bl-note--warning" role="status">
                    {daysLeft === 0
                      ? t('billing.myPlan.expiresToday')
                      : t('billing.myPlan.expiringSoon', { count: daysLeft })}
                  </p>
                )}
                {renewBan ? (
                  <p className="bl-note bl-note--danger">
                    {t('billing.pricing.bannedButton', { date: formatDate(renewBan.until) })}
                  </p>
                ) : (
                  <>
                    <div className="bl-period" role="group" aria-label={t('billing.pricing.period')}>
                      {PERIODS.filter((p) => (p === 'MONTH' ? sub.plan.priceMonth : sub.plan.priceYear) > 0).map(
                        (p) => (
                          <button
                            key={p}
                            type="button"
                            aria-pressed={renewPeriod === p}
                            className={`sc-btn sc-btn--sm${renewPeriod === p ? ' sc-btn--primary' : ''}`}
                            onClick={() => setRenewPeriod(p)}
                          >
                            {t(`billing.period.${p}`)}
                          </button>
                        ),
                      )}
                    </div>
                    {renewPrice > 0 && sub.expiresAt && (
                      <p className="bl-renew__summary">
                        {t('billing.myPlan.renewSummary', {
                          period: t(`billing.periodUnit.${renewPeriod}`),
                          amount: formatVnd(renewPrice),
                          date: formatDate(extendDate(sub.expiresAt, renewPeriod)),
                        })}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
            <div className="bl-actions">
              {canRenew && !renewBan && renewPrice > 0 && (
                <button type="button" className="sc-btn sc-btn--primary" disabled={renewing} onClick={renew}>
                  {renewing
                    ? t('billing.pricing.redirecting')
                    : t('billing.myPlan.renew', { period: t(`billing.periodUnit.${renewPeriod}`) })}
                </button>
              )}
              <Link className={`sc-btn${canRenew ? '' : ' sc-btn--primary'}`} to="/pricing">
                {t('billing.myPlan.viewPlans')}
              </Link>
            </div>
          </section>
        )}

        <section className="bl-card" aria-labelledby="bl-history-title">
          <div className="bl-card__head">
            <h2 id="bl-history-title">{t('billing.history.title')}</h2>
          </div>
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
