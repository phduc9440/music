import { useOutletContext, useSearchParams } from 'react-router-dom';
import { PageHeader, Tabs } from '../../components/ui';
import type { AdminOutletContext } from '../../components/admin/AdminLayout';
import PlanGrantPanel from '../../components/admin/PlanGrantPanel';
import PlanSuspensionPanel from '../../components/admin/PlanSuspensionPanel';
import { isSuperAdminMember } from '../../utils/auth';
import { t } from '../../i18n/core';

type Tab = 'grant' | 'suspend';

/**
 * Admin (sidebar "Gói thành viên"): một trang, chọn chức năng ở tab. "Cấp gói": chọn gói + số tháng rồi tích nhiều thành
 * viên. "Tạm ngưng gói": tạm ngưng / mở lại gói Pro theo vai trò của quản trị viên thường. Chỉ SUPER_ADMIN thao tác.
 */
export default function AdminMemberPlans() {
  const { admin } = useOutletContext<AdminOutletContext>();
  const canEdit = !!admin && isSuperAdminMember(admin);
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'suspend' ? 'suspend' : 'grant';

  return (
    <>
      <PageHeader title={t('admin.menu.items.memberPlans')} description={t('admin.memberPlans.subtitle')} />
      {!canEdit && (
        <p className="adm-plans-note" role="note">
          {t('admin.memberPlans.readOnly')}
        </p>
      )}
      <Tabs<Tab>
        value={tab}
        onChange={(next) => setParams(next === 'grant' ? {} : { tab: next })}
        items={[
          { value: 'grant', label: t('admin.memberPlans.tabGrant') },
          { value: 'suspend', label: t('admin.memberPlans.tabSuspend') },
        ]}
      />
      <div className="adm-member-plans__panel" role="tabpanel">
        {tab === 'grant' ? <PlanGrantPanel /> : <PlanSuspensionPanel />}
      </div>
    </>
  );
}
