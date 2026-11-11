import { useOutletContext, useSearchParams } from 'react-router-dom';
import { PageHeader, Tabs } from '../../components/ui';
import type { AdminOutletContext } from '../../components/admin/AdminLayout';
import PlanGrantPanel from '../../components/admin/PlanGrantPanel';
import PlanSanctionPanel from '../../components/admin/PlanSanctionPanel';
import { isSuperAdminMember } from '../../utils/auth';
import { t } from '../../i18n/core';

type Tab = 'grant' | 'sanction';

/**
 * Admin (sidebar "Gói thành viên"): một trang, chọn chức năng ở tab. "Cấp gói": chọn gói + số tháng rồi tích nhiều thành
 * viên. "Xử lý vi phạm": thu hồi gói đang dùng, cấm dùng gói trả phí có thời hạn, gỡ cấm. Chỉ SUPER_ADMIN thao tác.
 */
export default function AdminMemberPlans() {
  const { admin } = useOutletContext<AdminOutletContext>();
  const canEdit = !!admin && isSuperAdminMember(admin);
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'sanction' ? 'sanction' : 'grant';

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
          { value: 'sanction', label: t('admin.memberPlans.tabSanction') },
        ]}
      />
      <div className="adm-member-plans__panel" role="tabpanel">
        {tab === 'grant' ? <PlanGrantPanel /> : <PlanSanctionPanel />}
      </div>
    </>
  );
}
