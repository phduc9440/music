import { toast } from 'react-toastify';
import { errorMessage } from '../../components/ui/helpers';
import type { useDialog } from '../../components/ui/dialog-context';
import { adminTeamApi } from '../../services';
import type { AdminTeam } from '../../types';
import { t } from '../../i18n/core';

/**
 * Hỏi lý do rồi xóa mềm team (vi phạm). Thành viên nhận thông báo kèm lý do; dữ liệu giữ nguyên, khôi phục được 30 ngày.
 * Trả về true nếu đã xóa.
 */
export async function deleteTeamAsAdmin(
  team: Pick<AdminTeam, 'id' | 'name' | 'memberCount'>,
  prompt: ReturnType<typeof useDialog>['prompt'],
): Promise<boolean> {
  const reason = await prompt({
    title: t('admin.teams.deleteTitle', { name: team.name }),
    message: t('admin.teams.deleteMessage', { count: team.memberCount }),
    label: t('admin.teams.reason'),
    placeholder: t('admin.teams.reasonPlaceholder'),
    maxLength: 500,
    confirmLabel: t('admin.teams.delete'),
    tone: 'danger',
  });
  if (reason === null) return false;
  try {
    await adminTeamApi.remove(team.id, reason.trim());
    toast.success(t('admin.teams.deleted', { name: team.name }));
    return true;
  } catch (error) {
    toast.error(errorMessage(error, t('admin.teams.deleteFailed')));
    return false;
  }
}

/** Khôi phục team đã xóa mềm (còn trong 30 ngày). Trả về true nếu đã khôi phục. */
export async function restoreTeamAsAdmin(
  team: Pick<AdminTeam, 'id' | 'name'>,
  confirm: ReturnType<typeof useDialog>['confirm'],
): Promise<boolean> {
  const ok = await confirm({
    title: t('admin.teams.restoreTitle', { name: team.name }),
    message: t('admin.teams.restoreMessage'),
    confirmLabel: t('admin.teams.restore'),
  });
  if (!ok) return false;
  try {
    await adminTeamApi.restore(team.id);
    toast.success(t('admin.teams.restored', { name: team.name }));
    return true;
  } catch (error) {
    toast.error(errorMessage(error, t('admin.teams.restoreFailed')));
    return false;
  }
}
