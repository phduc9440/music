import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Badge, Button, ButtonLink, Card } from '../ui';
import SuspendRolePlanDialog from './SuspendRolePlanDialog';
import { useLiftRolePlan } from './useLiftRolePlan';
import type { AdminOutletContext } from './AdminLayout';
import { billingApi } from '../../services';
import type { MySubscription } from '../../types';
import { isSuperAdminMember } from '../../utils/auth';
import { formatDate, t } from '../../i18n/core';

/**
 * Admin: gói đang dùng của thành viên (trang chi tiết). SUPER_ADMIN có nút tạm ngưng / mở lại gói Pro theo vai trò (với
 * ADMIN thường) và nút mở trang "Gói thành viên".
 */
export default function MemberPlanCard({ memberId, memberName }: { memberId: string; memberName: string }) {
  const { admin } = useOutletContext<AdminOutletContext>();
  const canGrant = !!admin && isSuperAdminMember(admin);
  const [current, setCurrent] = useState<MySubscription | null>(null);
  const [suspending, setSuspending] = useState(false);
  const lift = useLiftRolePlan();

  const load = useCallback(() => {
    billingApi
      .ofMember(memberId)
      .then((res) => setCurrent(res.data.result))
      .catch(() => setCurrent(null));
  }, [memberId]);

  useEffect(() => {
    load();
  }, [load]);

  // Chỉ quản trị viên thường mới có gói Pro theo vai trò để tạm ngưng
  const isPlainAdmin = current?.roleGrant === 'ADMIN';

  return (
    <Card
      title={t('admin.plan.title')}
      actions={
        canGrant ? (
          <>
            {isPlainAdmin &&
              (current?.rolePlanSuspendedUntil ? (
                <Button
                  size="sm"
                  onClick={async () => {
                    if (await lift({ id: memberId, name: memberName })) load();
                  }}
                >
                  {t('admin.suspensions.lift')}
                </Button>
              ) : (
                <Button size="sm" variant="danger" icon="lock" onClick={() => setSuspending(true)}>
                  {t('admin.suspensions.suspend')}
                </Button>
              ))}
            <ButtonLink to="/admin/member-plans" size="sm" variant="primary" icon="star">
              {t('admin.grants.open')}
            </ButtonLink>
          </>
        ) : undefined
      }
    >
      {current ? (
        <p className="adm-member-plan__current">
          <strong>{current.status === 'UNLIMITED' ? t('billing.unlimitedPlan') : current.plan.name}</strong>{' '}
          <Badge tone={current.status === 'FREE' ? 'neutral' : 'success'}>
            {t(`billing.status.${current.status}`)}
          </Badge>
          {current.source && <span className="adm-muted"> · {t(`billing.source.${current.source}`)}</span>}
          {current.expiresAt && (
            <span className="adm-muted"> · {t('billing.myPlan.expires', { date: formatDate(current.expiresAt) })}</span>
          )}
          {current.rolePlanSuspendedUntil && (
            <span className="adm-muted">
              {' '}
              · {t('admin.suspensions.suspendedUntil', { date: formatDate(current.rolePlanSuspendedUntil) })}
            </span>
          )}
        </p>
      ) : (
        <p className="adm-muted">—</p>
      )}
      {!canGrant && <p className="adm-field__hint">{t('admin.plan.readOnly')}</p>}
      {suspending && (
        <SuspendRolePlanDialog
          member={{ id: memberId, name: memberName }}
          onClose={() => setSuspending(false)}
          onDone={() => {
            setSuspending(false);
            load();
          }}
        />
      )}
    </Card>
  );
}
