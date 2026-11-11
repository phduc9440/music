import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Badge, ButtonLink, Card } from '../ui';
import type { AdminOutletContext } from './AdminLayout';
import { billingApi } from '../../services';
import type { MySubscription } from '../../types';
import { isSuperAdminMember } from '../../utils/auth';
import { formatDate, t } from '../../i18n/core';

/**
 * Admin: gói đang dùng của thành viên (trang chi tiết). Cấp, gia hạn, hủy gói và tạm ngưng Pro của ADMIN làm ở trang
 * "Cấp gói" trong sidebar; SUPER_ADMIN có nút mở thẳng trang đó cho người này.
 */
export default function MemberPlanCard({ memberId }: { memberId: string }) {
  const { admin } = useOutletContext<AdminOutletContext>();
  const canGrant = !!admin && isSuperAdminMember(admin);
  const [current, setCurrent] = useState<MySubscription | null>(null);

  useEffect(() => {
    billingApi
      .ofMember(memberId)
      .then((res) => setCurrent(res.data.result))
      .catch(() => setCurrent(null));
  }, [memberId]);

  return (
    <Card
      title={t('admin.plan.title')}
      actions={
        canGrant ? (
          <ButtonLink to={`/admin/plan-grants?member=${memberId}`} size="sm" variant="primary" icon="star">
            {t('admin.grants.open')}
          </ButtonLink>
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
              · {t('admin.grants.roleSuspended', { date: formatDate(current.rolePlanSuspendedUntil) })}
            </span>
          )}
        </p>
      ) : (
        <p className="adm-muted">—</p>
      )}
      {!canGrant && <p className="adm-field__hint">{t('admin.plan.readOnly')}</p>}
    </Card>
  );
}
