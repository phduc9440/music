import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { useNavigate } from '../../routes/useTransitionNavigate';
import { translateError } from '../../i18n/core';
import { billingApi } from '../../services';
import type { MySubscription, PlanAudience, PlanInfo } from '../../types';
import { isGuest } from '../../utils/session';
import { formatDate, formatNumber, t } from '../../i18n/core';
import Skeleton from '../../components/ui/Skeleton';
import LimitList from './LimitList';
import { maxYearlyPercent, yearlySaving } from './yearlySaving';
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
  // Khách chưa đăng nhập xem được bảng giá; nút mua dẫn tới đăng nhập rồi quay lại đây
  const guest = isGuest();
  const navigate = useNavigate();

  useEffect(() => {
    billingApi
      .plans()
      .then((res) => setPlans(res.data.result))
      .catch(() => toast.error(t('billing.loadFailed')));
    // Khách không có gói: bỏ qua API cần đăng nhập (gọi sẽ bị 401 và đẩy ra trang đăng nhập)
    if (isGuest()) return;
    billingApi
      .mine()
      .then((res) => setMine(res.data.result))
      .catch(() => setMine(null));
  }, []);

  // Quản trị viên không cần mua: SUPER_ADMIN không giới hạn mọi gói, ADMIN đã có Pro không thời hạn
  const blockedReason = (plan: PlanInfo): string | null => {
    if (mine?.roleGrant === 'SUPER_ADMIN') return t('billing.pricing.notNeeded');
    const ban = mine?.bans?.find((b) => b.planCode === plan.code);
    if (ban) return t('billing.pricing.bannedButton', { date: formatDate(ban.until) });
    if (mine?.roleGrant === 'ADMIN' && plan.code === 'PRO') return t('billing.pricing.includedForAdmin');
    return null;
  };

  const bestYearly = plans ? maxYearlyPercent(plans) : null;

  // Gói đang có theo từng nhóm: mỗi người giữ tối đa một gói cá nhân và một gói team, mỗi gói gia hạn riêng
  const held = mine?.subscriptions ?? [];
  const heldInGroup = (audience: PlanAudience) => held.find((h) => h.plan.audience === audience) ?? null;
  const isCurrent = (plan: PlanInfo): boolean => {
    if (!mine || mine.status === 'UNLIMITED') return false;
    if (held.some((h) => h.plan.code === plan.code)) return true;
    // Pro theo vai trò của ADMIN là gói cá nhân đang dùng
    if (mine.source === 'ROLE') return plan.code === mine.plan.code;
    // Chưa có gói cá nhân nào thì đang ở Free (dù có gói team)
    return plan.code === 'FREE' && !heldInGroup('PERSONAL');
  };

  // Tạo đơn rồi chuyển sang trang thanh toán của cổng; gói chỉ được bật khi cổng báo lại cho máy chủ (IPN)
  const buy = async (plan: PlanInfo) => {
    if (guest) {
      navigate('/auth/login', { state: { from: '/pricing' } });
      return;
    }
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
              {/* nhãn mức giảm cao nhất khi trả theo năm, thấy được cả lúc đang xem giá tháng */}
              {p === 'YEAR' && bestYearly && (
                <span className="bl-period__save" aria-label={t('billing.pricing.saveUpTo', { percent: bestYearly })}>
                  −{bestYearly}%
                </span>
              )}
            </button>
          ))}
        </div>

        {mine?.bans?.map((b) => (
          <p key={b.planCode} className="bl-note bl-note--danger" role="alert">
            {t('billing.banned', { plan: b.planName, date: formatDate(b.until) })}
          </p>
        ))}
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
            const heldPlan = heldInGroup(audience);
            return (
              <section key={audience} className="bl-group" aria-labelledby={`bl-group-${audience}`}>
                <h2 id={`bl-group-${audience}`} className="bl-group__title">
                  {t(`billing.audience.${audience}`)}
                </h2>
                <p className="bl-group__desc">{t(`billing.audienceDesc.${audience}`)}</p>
                <div className="bl-grid">
                  {group.map((plan) => {
                    const price = period === 'MONTH' ? plan.priceMonth : plan.priceYear;
                    const saving = yearlySaving(plan);
                    const current = isCurrent(plan);
                    const blocked = blockedReason(plan);
                    // Mua gói khác trong nhóm đang có gói thì gói cũ của nhóm đó dừng ngay (gói nhóm kia giữ nguyên)
                    const replaces = current ? null : heldInGroup(plan.audience);
                    return (
                      <section key={plan.code} className={`bl-card${current ? ' is-current' : ''}`}>
                        <div className="bl-card__head">
                          <h3>{plan.name}</h3>
                          {current && <span className="bl-badge">{t('billing.pricing.current')}</span>}
                        </div>
                        <div className="bl-price">
                          {/* theo năm: giá trả lẻ 12 tháng gạch ngang đứng trước giá năm */}
                          {period === 'YEAR' && saving && (
                            <s
                              className="bl-price__old"
                              aria-label={t('billing.pricing.fullYearPrice', { amount: formatNumber(saving.fullYear) })}
                            >
                              {formatNumber(saving.fullYear)} ₫
                            </s>
                          )}
                          {price === 0 ? t('billing.pricing.free') : `${formatNumber(price)} ₫`}
                          {price > 0 && <small>/ {t(`billing.periodUnit.${period}`)}</small>}
                        </div>
                        {saving &&
                          (period === 'YEAR' ? (
                            <div className="bl-saving">
                              <span className="bl-saving__chip">
                                {t('billing.pricing.yearSaving', {
                                  amount: formatNumber(saving.saved),
                                  percent: saving.percent,
                                })}
                              </span>
                              <span className="bl-saving__note">
                                {t('billing.pricing.perMonthEquiv', { amount: formatNumber(saving.perMonth) })}
                                {saving.freeMonths > 0 &&
                                  ` · ${t('billing.pricing.freeMonths', { count: saving.freeMonths })}`}
                              </span>
                            </div>
                          ) : (
                            <button type="button" className="bl-saving__hint" onClick={() => setPeriod('YEAR')}>
                              {t('billing.pricing.yearHint', {
                                percent: saving.percent,
                                amount: formatNumber(saving.saved),
                              })}
                            </button>
                          ))}
                        <LimitList limits={plan.limits} />
                        {/* Nút và ghi chú luôn nằm sát đáy thẻ để các thẻ trong cùng hàng thẳng nhau */}
                        <div className="bl-card__foot">
                          {price > 0 && (
                            <button
                              type="button"
                              className="sc-btn sc-btn--primary"
                              disabled={buying !== null || blocked !== null}
                              aria-disabled={blocked !== null}
                              title={
                                blocked ??
                                (replaces ? t('billing.pricing.switchHint', { plan: replaces.plan.name }) : undefined)
                              }
                              onClick={() => buy(plan)}
                            >
                              {guest
                                ? t('billing.pricing.signInToBuy')
                                : blocked
                                  ? blocked
                                  : buying === plan.code
                                    ? t('billing.pricing.redirecting')
                                    : current
                                      ? t('billing.pricing.renew')
                                      : replaces
                                        ? t('billing.pricing.switch')
                                        : t('billing.pricing.buy')}
                            </button>
                          )}
                          {replaces && !blocked ? (
                            <p className="bl-note">{t('billing.pricing.switchHint', { plan: replaces.plan.name })}</p>
                          ) : (
                            // Thẻ không có ghi chú giữ chỗ bằng đúng ghi chú đó (ẩn) để nút ngang hàng các thẻ khác
                            heldPlan && (
                              <p className="bl-note bl-note--placeholder" aria-hidden="true">
                                {t('billing.pricing.switchHint', { plan: heldPlan.plan.name })}
                              </p>
                            )
                          )}
                        </div>
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
