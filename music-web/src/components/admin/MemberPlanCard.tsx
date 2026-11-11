import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Badge, Button, Card } from '../ui';
import { errorMessage } from '../ui/helpers';
import { useDialog } from '../ui/dialog-context';
import type { AdminOutletContext } from './AdminLayout';
import { billingApi } from '../../services';
import type { MySubscription, PlanInfo } from '../../types';
import { isSuperAdminMember } from '../../utils/auth';
import { formatDate, t } from '../../i18n/core';

/**
 * Admin: gói hiện tại của thành viên. Chỉ SUPER_ADMIN cấp gói cá nhân trong N ngày hoặc hủy gói (nguồn ADMIN_GRANT);
 * cấp gói team để sau (chờ tính năng Team).
 */
export default function MemberPlanCard({ memberId }: { memberId: string }) {
  const { confirm } = useDialog();
  const { admin } = useOutletContext<AdminOutletContext>();
  const canGrant = !!admin && isSuperAdminMember(admin);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [current, setCurrent] = useState<MySubscription | null>(null);
  const [planCode, setPlanCode] = useState('PRO');
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);

  const loadCurrent = useCallback(() => {
    billingApi
      .ofMember(memberId)
      .then((res) => setCurrent(res.data.result))
      .catch(() => setCurrent(null));
  }, [memberId]);

  useEffect(() => {
    loadCurrent();
    if (!canGrant) return;
    billingApi
      .plans()
      .then((res) => setPlans(res.data.result.filter((p) => p.audience === 'PERSONAL' && p.code !== 'FREE')))
      .catch(() => setPlans([]));
  }, [loadCurrent, canGrant]);

  const grant = async () => {
    setBusy(true);
    try {
      const res = await billingApi.grant({ memberId, planCode, days });
      const { plan, expiresAt } = res.data.result;
      toast.success(t('admin.plan.granted', { plan: plan.name, date: expiresAt ? formatDate(expiresAt) : '' }));
      loadCurrent();
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
      loadCurrent();
    } catch (error) {
      toast.error(errorMessage(error, t('admin.plan.failed')));
    } finally {
      setBusy(false);
    }
  };

  const targetIsSuper = current?.roleGrant === 'SUPER_ADMIN';
  const planName = current ? (current.status === 'UNLIMITED' ? t('billing.unlimitedPlan') : current.plan.name) : '';

  return (
    <Card title={t('admin.plan.title')} description={canGrant ? t('admin.plan.hint') : t('admin.plan.readOnly')}>
      {current && (
        <p className="adm-member-plan__current">
          <span className="adm-muted">{t('admin.plan.current')}</span> <strong>{planName}</strong>{' '}
          <Badge tone={current.status === 'FREE' ? 'neutral' : 'success'}>
            {t(`billing.status.${current.status}`)}
          </Badge>
          {current.source && <span className="adm-muted"> · {t(`billing.source.${current.source}`)}</span>}
          {current.expiresAt && (
            <span className="adm-muted"> · {t('billing.myPlan.expires', { date: formatDate(current.expiresAt) })}</span>
          )}
        </p>
      )}

      {canGrant && targetIsSuper && <p className="adm-muted">{t('admin.plan.superAdminTarget')}</p>}

      {canGrant && !targetIsSuper && (
        <div className="adm-member-plan__form">
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
          <Button variant="primary" disabled={busy || days < 1 || days > 3650 || plans.length === 0} onClick={grant}>
            {t('admin.plan.grant')}
          </Button>
          <Button
            variant="ghost"
            disabled={busy || (current?.source !== 'ADMIN_GRANT' && current?.source !== 'PAYMENT')}
            onClick={cancel}
          >
            {t('admin.plan.cancel')}
          </Button>
        </div>
      )}
      {canGrant && !targetIsSuper && <p className="adm-field__hint">{t('admin.plan.teamLater')}</p>}
    </Card>
  );
}
