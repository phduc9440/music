import { toast } from 'react-toastify';
import { errorMessage } from '../ui/helpers';
import { useDialog } from '../ui/dialog-context';
import { billingApi } from '../../services';
import { t } from '../../i18n/core';

/** Hỏi xác nhận rồi mở lại sớm gói Pro theo vai trò của một ADMIN; trả true nếu đã mở lại. */
export function useLiftRolePlan() {
  const { confirm } = useDialog();
  return async (member: { id: string; name: string }): Promise<boolean> => {
    const ok = await confirm({
      title: t('admin.suspensions.liftTitle', { name: member.name }),
      message: t('admin.suspensions.liftMessage'),
      confirmLabel: t('admin.suspensions.lift'),
    });
    if (!ok) return false;
    try {
      await billingApi.liftRolePlanSuspension(member.id);
      toast.success(t('admin.suspensions.lifted', { name: member.name }));
      return true;
    } catch (error) {
      toast.error(errorMessage(error, t('admin.plan.failed')));
      return false;
    }
  };
}
