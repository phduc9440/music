import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { translateError } from '../../i18n/core';
import { billingApi } from '../../services';
import type { MySubscription, PlanInfo } from '../../types';
import { formatNumber, t } from '../../i18n/core';
import Skeleton from '../../components/ui/Skeleton';
import LimitList from './LimitList';
import '../../components/scores/scores.css';
import './billing.css';

type Period = 'MONTH' | 'YEAR';

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

        {!plans && <Skeleton lines={5} />}
        <div className="bl-grid">
          {plans?.map((plan) => {
            const price = period === 'MONTH' ? plan.priceMonth : plan.priceYear;
            const current = mine?.plan.code === plan.code;
            return (
              <section key={plan.code} className={`bl-card${current ? ' is-current' : ''}`}>
                <div className="bl-card__head">
                  <h2>{plan.name}</h2>
                  {current && <span className="bl-badge">{t('billing.pricing.current')}</span>}
                </div>
                <div className="bl-price">
                  {price === 0 ? t('billing.pricing.free') : `${formatNumber(price)} ₫`}
                  {price > 0 && <small>/ {t(`billing.periodUnit.${period}`)}</small>}
                </div>
                <LimitList limits={plan.limits} />
                {price > 0 && !current && (
                  <button
                    type="button"
                    className="sc-btn sc-btn--primary"
                    disabled={buying !== null}
                    onClick={() => buy(plan)}
                  >
                    {buying === plan.code ? t('billing.pricing.redirecting') : t('billing.pricing.buy')}
                  </button>
                )}
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
