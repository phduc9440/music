import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Badge, Button, ButtonLink, Card } from '../ui';
import SanctionDialog from './SanctionDialog';
import type { SanctionMode } from './SanctionDialog';
import { useLiftBans } from './useLiftBans';
import type { AdminOutletContext } from './AdminLayout';
import { billingApi } from '../../services';
import type { MySubscription } from '../../types';
import { isSuperAdminMember } from '../../utils/auth';
import { formatDate, t } from '../../i18n/core';

/** Nguồn gói có thể thu hồi (mua hoặc được cấp, có ngày hết hạn). */
const REVOCABLE_SOURCES = ['PAYMENT', 'ADMIN_GRANT', 'POINTS_TRIAL'];

/**
 * Admin: gói đang dùng của thành viên (trang chi tiết). SUPER_ADMIN có nút xử lý vi phạm: thu hồi gói đang dùng, cấm dùng gói
 * trả phí có thời hạn hoặc gỡ cấm, và nút mở trang "Gói thành viên".
 */
export default function MemberPlanCard({ memberId, memberName }: { memberId: string; memberName: string }) {
  const { admin } = useOutletContext<AdminOutletContext>();
  const canEdit = !!admin && isSuperAdminMember(admin);
  const [current, setCurrent] = useState<MySubscription | null>(null);
  const [dialog, setDialog] = useState<SanctionMode | null>(null);
  const liftBans = useLiftBans();

  const load = useCallback(() => {
    billingApi
      .ofMember(memberId)
      .then((res) => setCurrent(res.data.result))
      .catch(() => setCurrent(null));
  }, [memberId]);

  useEffect(() => {
    load();
  }, [load]);

  const target = { id: memberId, name: memberName };
  const isSuperTarget = current?.roleGrant === 'SUPER_ADMIN';
  const revocable = !!current?.expiresAt && REVOCABLE_SOURCES.includes(current.source ?? '');

  return (
    <Card
      title={t('admin.plan.title')}
      actions={
        canEdit ? (
          <>
            {current && !isSuperTarget && revocable && !current.bannedUntil && (
              <Button size="sm" variant="ghost" onClick={() => setDialog('revoke')}>
                {t('admin.sanctions.revoke')}
              </Button>
            )}
            {current &&
              !isSuperTarget &&
              (current.bannedUntil ? (
                <Button
                  size="sm"
                  onClick={async () => {
                    if (await liftBans([target])) load();
                  }}
                >
                  {t('admin.sanctions.lift')}
                </Button>
              ) : (
                <Button size="sm" variant="danger" icon="lock" onClick={() => setDialog('ban')}>
                  {t('admin.sanctions.ban')}
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
          {current.bannedUntil && (
            <>
              {' '}
              <Badge tone="danger">{t('admin.sanctions.bannedUntil', { date: formatDate(current.bannedUntil) })}</Badge>
            </>
          )}
        </p>
      ) : (
        <p className="adm-muted">—</p>
      )}
      {!canEdit && <p className="adm-field__hint">{t('admin.plan.readOnly')}</p>}
      {dialog && (
        <SanctionDialog
          mode={dialog}
          members={[target]}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            load();
          }}
        />
      )}
    </Card>
  );
}
