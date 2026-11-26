import { useEffect, useState } from 'react';
import { userApi } from '../services';
import type { MyPoints } from '../services/auth/userApi';
import { formatNumber, formatRelativeTime, hasKey, t } from '../i18n/core';

/**
 * Thẻ "Điểm thưởng" ở trang hồ sơ (X-02, mục 7.5): tổng XP, số Nốt và các lần được cộng gần nhất. Điểm do hệ thống cộng
 * khi bản nhạc được công khai, đưa vào kho mẫu, đề xuất được nhận, câu trả lời được chọn, mời bạn, số hóa bản đầu.
 */
export default function PointsCard() {
  const [data, setData] = useState<MyPoints | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    userApi
      .points()
      .then((res) => setData(res.data.result))
      .catch(() => setFailed(true));
  }, []);

  const reasonText = (reason: string) =>
    hasKey(`profile.points.reasons.${reason}`) ? t(`profile.points.reasons.${reason}`) : reason;

  return (
    <section className="reveal-item pf-card pf-points">
      <h2 className="pf-card__title">{t('profile.points.title')}</h2>
      {failed && <p className="sc-error">{t('profile.points.loadFailed')}</p>}
      {!data && !failed && <div className="sc-skeleton pf-referral__skeleton" />}
      {data && (
        <>
          <div className="pf-referral__stats">
            <div>
              <strong>{formatNumber(data.xp)}</strong>
              <span>{t('profile.points.xp')}</span>
            </div>
            <div>
              <strong>{formatNumber(data.notes)}</strong>
              <span>{t('profile.points.notes')}</span>
            </div>
          </div>
          {data.recent.length === 0 ? (
            <p className="pf-referral__intro">{t('profile.points.empty')}</p>
          ) : (
            <ul className="pf-points__list">
              {data.recent.slice(0, 5).map((entry) => (
                <li key={`${entry.reason}-${entry.refId}`}>
                  <span>{reasonText(entry.reason)}</span>
                  <span className="pf-points__value">+{entry.xp} XP</span>
                  <time dateTime={entry.createdAt}>{formatRelativeTime(entry.createdAt)}</time>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
