import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Link } from '../../routes/transition-nav';
import { billingApi } from '../../services';
import type { MySubscription, PaymentOrder } from '../../types';
import { formatDate, formatDateTime, formatNumber, formatVnd, t, translateError } from '../../i18n/core';
import Skeleton from '../../components/ui/Skeleton';
import LimitList from './LimitList';
import PaymentCountdown from './PaymentCountdown';
import '../../components/scores/scores.css';
import './billing.css';

/** Trang /billing "Gói của tôi": gói đang dùng, ngày hết hạn và hạn mức đã dùng trong tháng (mục 7.3). */
export default function MyPlan() {
  const [sub, setSub] = useState<MySubscription | null>(null);
  const [orders, setOrders] = useState<PaymentOrder[] | null>(null);
  const [paying, setPaying] = useState<string | null>(null);

  useEffect(() => {
    billingApi
      .mine()
      .then((res) => setSub(res.data.result))
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
            {sub.bannedUntil && (
              <p className="bl-note bl-note--danger" role="alert">
                {t('billing.banned', { date: formatDate(sub.bannedUntil) })}
              </p>
            )}
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
            <div className="bl-actions">
              <Link className="sc-btn sc-btn--primary" to="/pricing">
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
