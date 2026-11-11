import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { translateError } from '../../i18n/core';
import { billingApi } from '../../services';
import type { MySubscription, PlanAudience, PlanInfo } from '../../types';
import { formatDate, formatNumber, t } from '../../i18n/core';
import Skeleton from '../../components/ui/Skeleton';
import LimitList from './LimitList';
import '../../components/scores/scores.css';
import './billing.css';

type Period = 'MONTH' | 'YEAR';

const AUDIENCES: PlanAudience[] = ['PERSONAL', 'TEAM'];

/** Trang /pricing: so sánh các gói (mục 7.2) và mua gói qua cổng thanh toán (mục 7.4). */
export default function Pricing() {
  const [plans, setPlans] = useState<PlanInfo[] | null>(null);
  const [mine, setMine] = useState<MySubscription | null>(null);
  const [period, setPeriod] = useState<Period>('MONTH');
  const [buying, setBuying] = useState<string | null>(null);

  useEffect(() => {
    billingApi
      .plans()
      .then((res) => setPlans(res.data.result))
      .catch(() => toast.error(t('billing.loadFailed')));
    billingApi
      .mine()
      .then((res) => setMine(res.data.result))
      .catch(() => setMine(null));
  }, []);

  // Quản trị viên không cần mua: SUPER_ADMIN không giới hạn mọi gói, ADMIN đã có Pro không thời hạn
  const blockedReason = (plan: PlanInfo): string | null => {
    if (mine?.roleGrant === 'SUPER_ADMIN') return t('billing.pricing.notNeeded');
    if (mine?.bannedUntil) return t('billing.pricing.bannedButton');
    if (mine?.roleGrant === 'ADMIN' && plan.code === 'PRO') return t('billing.pricing.includedForAdmin');
    return null;
  };

  // Tạo đơn rồi chuyển sang trang thanh toán của cổng; gói chỉ được bật khi cổng báo lại cho máy chủ (IPN)
  const buy = async (plan: PlanInfo) => {
    setBuying(plan.code);
    try {
      const res = await billingApi.createOrder({ planCode: plan.code, period });
      const payUrl = res.data.result.payUrl;
      if (payUrl) window.location.assign(payUrl);
    } catch (error) {
      toast.error(translateError(error, t('billing.pricing.buyFailed')));
      setBuying(null);
    }
  };

  return (
    <div className="sc-page">
      <main className="sc-container">
        <header className="sc-lib-head">
          <div>
            <h1>{t('billing.pricing.title')}</h1>
            <p>{t('billing.pricing.subtitle')}</p>
          </div>
        </header>

        <div className="bl-period" role="group" aria-label={t('billing.pricing.period')}>
          {(['MONTH', 'YEAR'] as Period[]).map((p) => (
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

        {mine?.bannedUntil && (
          <p className="bl-note bl-note--danger" role="alert">
            {t('billing.banned', { date: formatDate(mine.bannedUntil) })}
          </p>
        )}
        {mine?.roleGrant && (
          <p className="bl-note" role="note">
            {t(`billing.pricing.roleNote.${mine.roleGrant}`)}
          </p>
        )}

        {!plans && <Skeleton lines={5} />}
        {plans &&
          AUDIENCES.map((audience) => {
            const group = plans.filter((p) => p.audience === audience);
            if (group.length === 0) return null;
            return (
              <section key={audience} className="bl-group" aria-labelledby={`bl-group-${audience}`}>
                <h2 id={`bl-group-${audience}`} className="bl-group__title">
                  {t(`billing.audience.${audience}`)}
                </h2>
                <p className="bl-group__desc">{t(`billing.audienceDesc.${audience}`)}</p>
                <div className="bl-grid">
                  {group.map((plan) => {
                    const price = period === 'MONTH' ? plan.priceMonth : plan.priceYear;
                    const current = mine?.plan.code === plan.code;
                    const blocked = blockedReason(plan);
                    return (
                      <section key={plan.code} className={`bl-card${current ? ' is-current' : ''}`}>
                        <div className="bl-card__head">
                          <h3>{plan.name}</h3>
                          {current && <span className="bl-badge">{t('billing.pricing.current')}</span>}
                        </div>
                        <div className="bl-price">
                          {price === 0 ? t('billing.pricing.free') : `${formatNumber(price)} ₫`}
                          {price > 0 && <small>/ {t(`billing.periodUnit.${period}`)}</small>}
                        </div>
                        <LimitList limits={plan.limits} />
                        {price > 0 && (
                          <button
                            type="button"
                            className="sc-btn sc-btn--primary"
                            disabled={buying !== null || blocked !== null}
                            aria-disabled={blocked !== null}
                            title={blocked ?? undefined}
                            onClick={() => buy(plan)}
                          >
                            {blocked
                              ? blocked
                              : buying === plan.code
                                ? t('billing.pricing.redirecting')
                                : current
                                  ? t('billing.pricing.renew')
                                  : t('billing.pricing.buy')}
                          </button>
                        )}
                      </section>
                    );
                  })}
                </div>
              </section>
            );
          })}
      </main>
    </div>
  );
}
