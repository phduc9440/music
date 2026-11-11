import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Button, Card } from '../ui';
import { errorMessage } from '../ui/helpers';
import { useDialog } from '../ui/dialog-context';
import { billingApi } from '../../services';
import type { PlanInfo } from '../../types';
import { formatDate, t } from '../../i18n/core';

/** Admin: cấp gói cho thành viên trong N ngày hoặc hủy gói đang dùng (mục 7.3, nguồn ADMIN_GRANT). */
export default function MemberPlanCard({ memberId }: { memberId: string }) {
  const { confirm } = useDialog();
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [planCode, setPlanCode] = useState('PRO');
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    billingApi
      .plans()
      .then((res) => setPlans(res.data.result.filter((p) => p.code !== 'FREE')))
      .catch(() => setPlans([]));
  }, []);

  const grant = async () => {
    setBusy(true);
    try {
      const res = await billingApi.grant({ memberId, planCode, days });
      const { plan, expiresAt } = res.data.result;
      toast.success(t('admin.plan.granted', { plan: plan.name, date: expiresAt ? formatDate(expiresAt) : '' }));
    } catch (error) {
      toast.error(errorMessage(error, t('admin.plan.failed')));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!(await confirm({ title: t('admin.plan.cancelTitle'), message: t('admin.plan.cancelMessage') }))) return;
    setBusy(true);
    try {
      await billingApi.cancel(memberId);
      toast.success(t('admin.plan.canceled'));
    } catch (error) {
      toast.error(errorMessage(error, t('admin.plan.failed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={t('admin.plan.title')} description={t('admin.plan.hint')}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
        <select
          className="adm-input"
          value={planCode}
          aria-label={t('admin.plan.plan')}
          disabled={busy}
          onChange={(e) => setPlanCode(e.target.value)}
        >
          {plans.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          className="adm-input"
          type="number"
          min={1}
          max={3650}
          style={{ width: 100 }}
          value={days}
          aria-label={t('admin.plan.days')}
          disabled={busy}
          onChange={(e) => setDays(Number(e.target.value))}
        />
        <span>{t('admin.plan.daysUnit')}</span>
        <Button variant="primary" disabled={busy || days < 1 || days > 3650} onClick={grant}>
          {t('admin.plan.grant')}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={cancel}>
          {t('admin.plan.cancel')}
        </Button>
      </div>
    </Card>
  );
}
