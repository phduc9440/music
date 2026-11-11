import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Badge, Button, Card, PageHeader } from '../../components/ui';
import { errorMessage } from '../../components/ui/helpers';
import Skeleton from '../../components/ui/Skeleton';
import type { AdminOutletContext } from '../../components/admin/AdminLayout';
import { billingApi } from '../../services';
import type { PlanAudience, PlanInfo, PlanLimits } from '../../types';
import { isSuperAdminMember } from '../../utils/auth';
import { t } from '../../i18n/core';

const AUDIENCES: PlanAudience[] = ['PERSONAL', 'TEAM'];

/** Hạn mức dạng số; để trống (tích "Không giới hạn") = null. */
const NUMBER_LIMITS = ['omrPagesPerMonth', 'omrConcurrent', 'storageMb', 'keptVersions', 'exportsPerMonth'] as const;
/** Quyền lợi bật/tắt. */
const FLAG_LIMITS = ['collab', 'team', 'omrPriority'] as const;

type NumberKey = (typeof NUMBER_LIMITS)[number];
type FlagKey = (typeof FLAG_LIMITS)[number];

/** Bản nháp trên form: số giữ dạng chuỗi để ô nhập trống được; null = không giới hạn. */
type Draft = {
  name: string;
  priceMonth: string;
  priceYear: string;
  numbers: Record<NumberKey, string | null>;
  flags: Record<FlagKey, boolean>;
};

const digits = (value: string, max = 10) => value.replace(/\D/g, '').slice(0, max);

const toDraft = (p: PlanInfo): Draft => ({
  name: p.name,
  priceMonth: String(p.priceMonth),
  priceYear: String(p.priceYear),
  numbers: Object.fromEntries(
    NUMBER_LIMITS.map((k) => [k, p.limits[k] == null ? null : String(p.limits[k])]),
  ) as Draft['numbers'],
  flags: Object.fromEntries(FLAG_LIMITS.map((k) => [k, !!p.limits[k]])) as Draft['flags'],
});

const toLimits = (d: Draft): PlanLimits => ({
  ...(Object.fromEntries(
    NUMBER_LIMITS.map((k) => [k, d.numbers[k] == null ? null : Number(d.numbers[k] || 0)]),
  ) as Pick<PlanLimits, NumberKey>),
  ...d.flags,
});

/**
 * Admin: tên, giá và hạn mức của từng gói (Cá nhân / Team). Mọi quản trị viên xem được; chỉ SUPER_ADMIN sửa được. Gói
 * Free luôn miễn phí. Đơn đã tạo trước khi đổi giá giữ số tiền cũ; hạn mức mới áp dụng ngay cho người đang dùng gói.
 */
export default function AdminPlans() {
  const { admin } = useOutletContext<AdminOutletContext>();
  const canEdit = !!admin && isSuperAdminMember(admin);
  const [plans, setPlans] = useState<PlanInfo[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    billingApi
      .adminPlans()
      .then((res) => {
        setPlans(res.data.result);
        setDrafts(Object.fromEntries(res.data.result.map((p) => [p.code, toDraft(p)])));
      })
      .catch((error) => toast.error(errorMessage(error, t('admin.plans.loadFailed'))));
  }, []);

  const patch = (code: string, change: (d: Draft) => Draft) =>
    setDrafts((all) => (all[code] ? { ...all, [code]: change(all[code]) } : all));

  const changed = (p: PlanInfo) => {
    const d = drafts[p.code];
    return !!d && JSON.stringify(d) !== JSON.stringify(toDraft(p));
  };

  const save = async (p: PlanInfo) => {
    const d = drafts[p.code];
    if (!d) return;
    setSaving(p.code);
    try {
      const res = await billingApi.updatePlan(p.code, {
        name: d.name.trim(),
        priceMonth: Number(d.priceMonth || 0),
        priceYear: Number(d.priceYear || 0),
        limits: toLimits(d),
      });
      const updated = res.data.result;
      setPlans((list) => list?.map((x) => (x.code === updated.code ? updated : x)) ?? null);
      setDrafts((all) => ({ ...all, [updated.code]: toDraft(updated) }));
      toast.success(t('admin.plans.saved', { plan: updated.name }));
    } catch (error) {
      toast.error(errorMessage(error, t('admin.plans.saveFailed')));
    } finally {
      setSaving(null);
    }
  };

  const renderPlan = (p: PlanInfo) => {
    const d = drafts[p.code];
    if (!d) return null;
    const free = p.code === 'FREE';
    return (
      <Card
        key={p.code}
        title={
          <>
            {p.name} <span className="adm-code adm-muted">{p.code}</span>
          </>
        }
        actions={free ? <Badge tone="neutral">{t('billing.pricing.free')}</Badge> : undefined}
      >
        <fieldset className="adm-plan-form" disabled={!canEdit || saving === p.code}>
          <label className="adm-field">
            <span className="adm-field__label">{t('admin.plans.name')}</span>
            <input
              className="adm-input"
              value={d.name}
              maxLength={100}
              onChange={(e) => patch(p.code, (x) => ({ ...x, name: e.target.value }))}
            />
          </label>

          <div className="adm-plan-form__row">
            {(['priceMonth', 'priceYear'] as const).map((field) => (
              <label key={field} className="adm-field">
                <span className="adm-field__label">{t(`admin.plans.${field}`)}</span>
                <input
                  className="adm-input adm-plan-form__num"
                  inputMode="numeric"
                  value={d[field]}
                  disabled={free}
                  onChange={(e) => patch(p.code, (x) => ({ ...x, [field]: digits(e.target.value) }))}
                />
              </label>
            ))}
          </div>

          <h4 className="adm-plan-form__heading">{t('admin.plans.limits')}</h4>
          <div className="adm-plan-form__limits">
            {NUMBER_LIMITS.map((k) => {
              const unlimited = d.numbers[k] == null;
              return (
                <div key={k} className="adm-field">
                  <label className="adm-field__label" htmlFor={`${p.code}-${k}`}>
                    {t(`billing.limits.${k}`)}
                    {k === 'storageMb' && <span className="adm-muted"> (MB)</span>}
                  </label>
                  <input
                    id={`${p.code}-${k}`}
                    className="adm-input adm-plan-form__num"
                    inputMode="numeric"
                    value={unlimited ? '' : (d.numbers[k] ?? '')}
                    placeholder={unlimited ? t('billing.unlimited') : undefined}
                    disabled={unlimited}
                    onChange={(e) =>
                      patch(p.code, (x) => ({ ...x, numbers: { ...x.numbers, [k]: digits(e.target.value, 8) } }))
                    }
                  />
                  <label className="adm-plan-form__check">
                    <input
                      type="checkbox"
                      checked={unlimited}
                      onChange={(e) =>
                        patch(p.code, (x) => ({
                          ...x,
                          numbers: { ...x.numbers, [k]: e.target.checked ? null : String(p.limits[k] ?? 1) },
                        }))
                      }
                    />
                    {t('billing.unlimited')}
                  </label>
                </div>
              );
            })}
          </div>

          <div className="adm-plan-form__flags">
            {FLAG_LIMITS.map((k) => (
              <label key={k} className="adm-plan-form__check">
                <input
                  type="checkbox"
                  checked={d.flags[k]}
                  onChange={(e) => patch(p.code, (x) => ({ ...x, flags: { ...x.flags, [k]: e.target.checked } }))}
                />
                {t(`billing.limits.${k}`)}
              </label>
            ))}
          </div>
        </fieldset>

        {canEdit && (
          <div className="adm-plan-form__actions">
            {changed(p) && (
              <Button variant="ghost" onClick={() => setDrafts((all) => ({ ...all, [p.code]: toDraft(p) }))}>
                {t('admin.plans.reset')}
              </Button>
            )}
            <Button
              variant="primary"
              disabled={!changed(p) || !d.name.trim()}
              loading={saving === p.code}
              onClick={() => save(p)}
            >
              {t('admin.plans.save')}
            </Button>
          </div>
        )}
      </Card>
    );
  };

  return (
    <>
      <PageHeader title={t('admin.menu.items.plans')} description={t('admin.plans.subtitle')} />
      {!canEdit && (
        <p className="adm-plans-note" role="note">
          {t('admin.plans.readOnly')}
        </p>
      )}
      {!plans && <Skeleton lines={6} />}
      {plans &&
        AUDIENCES.map((audience) => (
          <section key={audience} className="adm-plan-group">
            <h2 className="adm-plan-group__title">{t(`billing.audience.${audience}`)}</h2>
            <div className="adm-plan-grid">{plans.filter((p) => p.audience === audience).map(renderPlan)}</div>
          </section>
        ))}
    </>
  );
}
