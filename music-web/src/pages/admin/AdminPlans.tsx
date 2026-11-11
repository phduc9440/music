import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Badge, Button, Card, PageHeader, Table, TableState } from '../../components/ui';
import { errorMessage } from '../../components/ui/helpers';
import type { AdminOutletContext } from '../../components/admin/AdminLayout';
import { billingApi } from '../../services';
import type { PlanAudience, PlanInfo } from '../../types';
import { isSuperAdminMember } from '../../utils/auth';
import { formatVnd, t } from '../../i18n/core';

const AUDIENCES: PlanAudience[] = ['PERSONAL', 'TEAM'];

type Draft = { month: string; year: string };

/** Chỉ nhận chữ số (giá VND nguyên). */
const digits = (value: string) => value.replace(/\D/g, '').slice(0, 10);

/**
 * Admin: giá các gói dịch vụ (Cá nhân / Team). Mọi quản trị viên xem được; chỉ SUPER_ADMIN sửa được giá. Gói Free luôn
 * miễn phí. Đơn đã tạo trước khi đổi giá vẫn giữ số tiền cũ.
 */
export default function AdminPlans() {
  const { admin } = useOutletContext<AdminOutletContext>();
  const canEdit = !!admin && isSuperAdminMember(admin);
  const [plans, setPlans] = useState<PlanInfo[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = () =>
    billingApi
      .adminPlans()
      .then((res) => {
        setPlans(res.data.result);
        setDrafts(
          Object.fromEntries(
            res.data.result.map((p) => [p.code, { month: String(p.priceMonth), year: String(p.priceYear) }]),
          ),
        );
      })
      .catch((error) => toast.error(errorMessage(error, t('admin.plans.loadFailed'))));

  useEffect(() => {
    load();
  }, []);

  const changed = (p: PlanInfo) => {
    const d = drafts[p.code];
    return !!d && (Number(d.month) !== p.priceMonth || Number(d.year) !== p.priceYear);
  };

  const save = async (p: PlanInfo) => {
    const d = drafts[p.code];
    if (!d) return;
    setSaving(p.code);
    try {
      const res = await billingApi.updatePlanPrice(p.code, {
        priceMonth: Number(d.month || 0),
        priceYear: Number(d.year || 0),
      });
      const updated = res.data.result;
      setPlans((list) => list?.map((x) => (x.code === updated.code ? updated : x)) ?? null);
      toast.success(t('admin.plans.saved', { plan: updated.name }));
    } catch (error) {
      toast.error(errorMessage(error, t('admin.plans.saveFailed')));
    } finally {
      setSaving(null);
    }
  };

  const reset = (p: PlanInfo) =>
    setDrafts((all) => ({ ...all, [p.code]: { month: String(p.priceMonth), year: String(p.priceYear) } }));

  return (
    <>
      <PageHeader title={t('admin.menu.items.plans')} description={t('admin.plans.subtitle')} />
      {!canEdit && (
        <p className="adm-plans-note" role="note">
          {t('admin.plans.readOnly')}
        </p>
      )}

      {AUDIENCES.map((audience) => {
        const group = plans?.filter((p) => p.audience === audience);
        return (
          <Card key={audience} title={t(`billing.audience.${audience}`)} flush>
            <Table>
              <thead>
                <tr>
                  <th>{t('admin.plan.plan')}</th>
                  <th>{t('admin.plans.priceMonth')}</th>
                  <th>{t('admin.plans.priceYear')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {!plans && <TableState colSpan={4} loading />}
                {group?.map((p) => {
                  const d = drafts[p.code] ?? { month: '', year: '' };
                  const free = p.code === 'FREE';
                  const locked = !canEdit || free;
                  return (
                    <tr key={p.code}>
                      <td>
                        <strong>{p.name}</strong> <span className="adm-code adm-muted">{p.code}</span>
                        {free && (
                          <>
                            {' '}
                            <Badge tone="neutral">{t('billing.pricing.free')}</Badge>
                          </>
                        )}
                      </td>
                      {(['month', 'year'] as const).map((field) => (
                        <td key={field}>
                          {locked ? (
                            formatVnd(field === 'month' ? p.priceMonth : p.priceYear)
                          ) : (
                            <input
                              className="adm-input adm-plans-price"
                              inputMode="numeric"
                              aria-label={`${p.name} · ${t(field === 'month' ? 'admin.plans.priceMonth' : 'admin.plans.priceYear')}`}
                              value={d[field]}
                              onChange={(e) =>
                                setDrafts((all) => ({ ...all, [p.code]: { ...d, [field]: digits(e.target.value) } }))
                              }
                            />
                          )}
                        </td>
                      ))}
                      <td className="adm-nowrap">
                        {!locked && (
                          <>
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={!changed(p)}
                              loading={saving === p.code}
                              onClick={() => save(p)}
                            >
                              {t('admin.plans.save')}
                            </Button>{' '}
                            {changed(p) && (
                              <Button size="sm" variant="ghost" onClick={() => reset(p)}>
                                {t('admin.plans.reset')}
                              </Button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        );
      })}
    </>
  );
}
