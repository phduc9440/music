import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { userApi } from '../services';
import { formatNumber, t } from '../i18n/core';

type Referral = { code: string; invitedCount: number; rewardedCount: number };

/**
 * Thẻ "Mời bạn" ở trang hồ sơ (7.5): mã giới thiệu, link mời để sao chép và số người đã mời. Người được mời đăng ký
 * bằng mã và số hóa xong bản đầu tiên thì cả hai bên được thưởng (sổ điểm cộng điểm, giới hạn 10 người mỗi tháng).
 */
export default function ReferralCard() {
  const [data, setData] = useState<Referral | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    userApi
      .referral()
      .then((res) => setData(res.data.result))
      .catch(() => setFailed(true));
  }, []);

  const link = data ? `${window.location.origin}/auth/login?ref=${data.code}` : '';

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('profile.referral.copied'));
    } catch {
      toast.error(t('profile.referral.copyFailed'));
    }
  };

  return (
    <section className="reveal-item pf-card">
      <h2 className="reveal-item pf-card__title">{t('profile.referral.title')}</h2>
      <p className="pf-hint">{t('profile.referral.intro')}</p>
      {failed && <p className="sc-error">{t('profile.referral.loadFailed')}</p>}
      {data && (
        <>
          <dl className="pf-dl">
            <div>
              <dt>{t('profile.referral.code')}</dt>
              <dd className="pf-referral-code">{data.code}</dd>
            </div>
            <div>
              <dt>{t('profile.referral.invited')}</dt>
              <dd>{formatNumber(data.invitedCount)}</dd>
            </div>
            <div>
              <dt>{t('profile.referral.rewarded')}</dt>
              <dd>{formatNumber(data.rewardedCount)}</dd>
            </div>
          </dl>
          <div className="pf-form-actions">
            <button type="button" className="sc-btn" onClick={() => copy(data.code)}>
              {t('profile.referral.copyCode')}
            </button>
            <button type="button" className="sc-btn sc-btn--primary" onClick={() => copy(link)}>
              {t('profile.referral.copyLink')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
