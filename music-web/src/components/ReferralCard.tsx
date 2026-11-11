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
    <section className="reveal-item pf-card pf-referral">
      <h2 className="pf-card__title">{t('profile.referral.title')}</h2>
      <p className="pf-referral__intro">{t('profile.referral.intro')}</p>
      {failed && <p className="sc-error">{t('profile.referral.loadFailed')}</p>}
      {!data && !failed && <div className="sc-skeleton pf-referral__skeleton" />}
      {data && (
        <>
          <div className="pf-referral__box">
            <span className="pf-referral__label">{t('profile.referral.code')}</span>
            <strong className="pf-referral__code">{data.code}</strong>
            <button type="button" className="sc-btn sc-btn--sm" onClick={() => copy(data.code)}>
              {t('profile.referral.copyCode')}
            </button>
          </div>
          <div className="pf-referral__stats">
            <div>
              <strong>{formatNumber(data.invitedCount)}</strong>
              <span>{t('profile.referral.invited')}</span>
            </div>
            <div>
              <strong>{formatNumber(data.rewardedCount)}</strong>
              <span>{t('profile.referral.rewarded')}</span>
            </div>
          </div>
          <button type="button" className="sc-btn sc-btn--primary pf-referral__link" onClick={() => copy(link)}>
            {t('profile.referral.copyLink')}
          </button>
        </>
      )}
    </section>
  );
}
