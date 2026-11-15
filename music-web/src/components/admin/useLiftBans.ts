import { toast } from 'react-toastify';
import { errorMessage } from '../ui/helpers';
import { useDialog } from '../ui/dialog-context';
import { billingApi } from '../../services';
import { t } from '../../i18n/core';

/** Hỏi xác nhận rồi gỡ cấm sớm cho một hoặc nhiều người; trả true nếu đã gọi xong. */
export function useLiftBans() {
  const { confirm } = useDialog();
  return async (members: { id: string; name: string }[]): Promise<boolean> => {
    if (members.length === 0) return false;
    const who = members.length === 1 ? members[0].name : t('admin.sanctions.people', { count: members.length });
    const ok = await confirm({
      title: t('admin.sanctions.liftTitle', { who }),
      message: t('admin.sanctions.liftMessage'),
      confirmLabel: t('admin.sanctions.lift'),
    });
    if (!ok) return false;
    try {
      const res = await billingApi.liftBans(members.map((m) => m.id));
      const done = res.data.result.filter((r) => r.status === 'LIFTED').length;
      toast.success(t('admin.sanctions.lifted', { count: done }));
      return true;
    } catch (error) {
      toast.error(errorMessage(error, t('admin.plan.failed')));
      return false;
    }
  };
}
