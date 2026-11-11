import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Link } from '../../routes/transition-nav';
import { billingApi } from '../../services';
import type { MySubscription } from '../../types';
import { formatDate, formatNumber, t } from '../../i18n/core';
import Skeleton from '../../components/ui/Skeleton';
import LimitList from './LimitList';
import '../../components/scores/scores.css';
import './billing.css';

/** Trang /billing "Gói của tôi": gói đang dùng, ngày hết hạn và hạn mức đã dùng trong tháng (mục 7.3). */
export default function MyPlan() {
  const [sub, setSub] = useState<MySubscription | null>(null);

  useEffect(() => {
    billingApi
      .mine()
      .then((res) => setSub(res.data.result))
      .catch(() => toast.error(t('billing.loadFailed')));
  }, []);

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
              <h2>{sub.plan.name}</h2>
              <span className="bl-badge">{t(`billing.status.${sub.status}`)}</span>
            </div>
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
      </main>
    </div>
  );
}
