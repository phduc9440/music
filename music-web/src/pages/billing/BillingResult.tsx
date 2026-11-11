import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link } from '../../routes/transition-nav';
import { billingApi } from '../../services';
import type { PaymentOrder } from '../../types';
import { formatDateTime, formatVnd, t } from '../../i18n/core';
import Skeleton from '../../components/ui/Skeleton';
import '../../components/scores/scores.css';
import './billing.css';

const POLL_MS = 2_000;
const MAX_POLLS = 15;

/**
 * Trang cổng thanh toán đưa người dùng về (mục 7.4). Tham số trên link có thể bị sửa nên trang này KHÔNG kích hoạt gì:
 * chỉ lấy mã đơn rồi hỏi máy chủ trạng thái thật. Gói được bật bởi IPN (cổng gọi máy chủ), có thể đến chậm vài giây nên
 * trang hỏi lại vài lần khi đơn còn PENDING.
 */
export default function BillingResult() {
  const [params] = useSearchParams();
  const orderCode = params.get('vnp_TxnRef') ?? params.get('orderCode');
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [missing, setMissing] = useState(!orderCode);

  useEffect(() => {
    if (!orderCode) return;
    let cancelled = false;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      billingApi
        .getOrder(orderCode)
        .then((res) => {
          if (cancelled) return;
          setOrder(res.data.result);
          if (res.data.result.status === 'PENDING' && ++polls < MAX_POLLS) timer = setTimeout(check, POLL_MS);
        })
        .catch(() => !cancelled && setMissing(true));
    };
    check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [orderCode]);

  return (
    <div className="sc-page">
      <main className="sc-container sc-container--form">
        <header className="sc-lib-head">
          <div>
            <h1>{t('billing.result.title')}</h1>
          </div>
        </header>

        {missing && <p className="sc-error">{t('billing.result.notFound')}</p>}
        {!missing && !order && <Skeleton lines={4} />}
        {order && (
          <section className="bl-card" aria-live="polite">
            <div className="bl-card__head">
              <h2>{t(`billing.result.status.${order.status}`)}</h2>
              <span className="bl-badge">{order.orderCode}</span>
            </div>
            <p>{t(`billing.result.message.${order.status}`)}</p>
            <ul className="bl-limits">
              <li>
                <span>{t('billing.result.plan')}</span>
                <strong>
                  {order.planName} · {t(`billing.period.${order.period}`)}
                </strong>
              </li>
              <li>
                <span>{t('billing.result.amount')}</span>
                <strong>{formatVnd(order.amount)}</strong>
              </li>
              {order.paidAt && (
                <li>
                  <span>{t('billing.result.paidAt')}</span>
                  <strong>{formatDateTime(order.paidAt)}</strong>
                </li>
              )}
            </ul>
            <div className="bl-actions">
              <Link className="sc-btn sc-btn--primary" to="/billing">
                {t('billing.myPlan.title')}
              </Link>
              {order.status !== 'PAID' && order.status !== 'PENDING' && (
                <Link className="sc-btn" to="/pricing">
                  {t('billing.result.tryAgain')}
                </Link>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
