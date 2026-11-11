import { useEffect, useState } from 'react';
import { t } from '../../i18n/core';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Đồng hồ đếm ngược thời gian còn lại để thanh toán một đơn đang chờ (mm:ss). Hết giờ thì gọi `onExpire` đúng một lần
 * để trang bỏ đơn khỏi danh sách; đơn cũng sẽ được máy chủ chuyển sang hết hạn.
 */
export default function PaymentCountdown({ expiresAt, onExpire }: { expiresAt: string; onExpire: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const left = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));

  useEffect(() => {
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (new Date(expiresAt).getTime() <= current) {
        clearInterval(timer);
        onExpire();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, onExpire]);

  const urgent = left > 0 && left <= 60;
  return (
    <span className={`bl-countdown${urgent ? ' is-urgent' : ''}`} role="timer" aria-live="off">
      {t('billing.history.countdown', { time: `${pad(Math.floor(left / 60))}:${pad(left % 60)}` })}
    </span>
  );
}
