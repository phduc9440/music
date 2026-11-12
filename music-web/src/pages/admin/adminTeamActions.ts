import { toast } from 'react-toastify';
import { errorMessage } from '../../components/ui/helpers';
import type { useDialog } from '../../components/ui/dialog-context';
import { adminTeamApi } from '../../services';
import type { AdminTeam } from '../../types';
import { t } from '../../i18n/core';

/**
 * Hỏi lý do rồi xóa team (vi phạm). Thành viên nhận thông báo kèm lý do; bản nhạc của team trở về bản cá nhân của chủ.
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
