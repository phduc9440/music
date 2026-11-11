import { useState } from 'react';
import { toast } from 'react-toastify';
import { scoreApi } from '../../../services';
import type { ScoreDetail, Visibility } from '../../../types';
import { t } from '../../../i18n/core';
import { getErrorMessage } from '../../../utils/score';
import { Icon } from '../../ui';
import { useDialog } from '../../ui/dialog-context';

interface Props {
  score: ScoreDetail;
  /** Gọi với bản nhạc đã cập nhật để trang chi tiết hiện trạng thái mới. */
  onChanged: (score: ScoreDetail) => void;
}

type ActionConfig = {
  label: string;
  icon: 'globe' | 'lock';
  target: Visibility;
  title: string;
  message: string;
  confirm: string;
  done: string;
};

/** Cấu hình một trạng thái; chữ là getter nên luôn lấy theo ngôn ngữ đang dùng. */
const action = (from: Visibility, icon: 'globe' | 'lock', target: Visibility): ActionConfig => ({
  icon,
  target,
  get label() {
    return t(`scores.publish.${from}.label`);
  },
  get title() {
    return t(`scores.publish.${from}.title`);
  },
  get message() {
    return t(`scores.publish.${from}.message`);
  },
  get confirm() {
    return t(`scores.publish.${from}.confirm`);
  },
  get done() {
    return t(`scores.publish.${from}.done`);
  },
});

/** Nội dung từng trạng thái: nhãn nút, hộp xác nhận và trạng thái muốn chuyển tới. */
const ACTIONS: Record<
  Visibility,
  {
    label: string;
    icon: 'globe' | 'lock';
    target: Visibility;
    title: string;
    message: string;
    confirm: string;
    done: string;
  }
> = {
  PRIVATE: action('PRIVATE', 'globe', 'PUBLIC'),
  PENDING: action('PENDING', 'lock', 'PRIVATE'),
  PUBLIC: action('PUBLIC', 'lock', 'PRIVATE'),
};

/** Nút cạnh nhãn quyền riêng tư ở đầu trang chi tiết: xin công khai, hủy yêu cầu đang chờ, hoặc chuyển về riêng tư. */
export default function PublishToggle({ score, onChanged }: Props) {
  const { confirm } = useDialog();
  const [busy, setBusy] = useState(false);
  const action = ACTIONS[score.visibility];

  const run = async () => {
    const ok = await confirm({
      title: action.title,
      message: action.message,
      confirmLabel: action.confirm,
      tone: action.target === 'PRIVATE' && score.visibility === 'PUBLIC' ? 'danger' : undefined,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await scoreApi.update(score.id, { visibility: action.target });
      onChanged(res.data.result);
      toast.success(action.done);
    } catch (error) {
      toast.error(getErrorMessage(error, t('scores.publish.failed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className="sc-btn sc-btn--sm" disabled={busy} onClick={run}>
      <Icon name={action.icon} size={14} />
      {action.label}
    </button>
  );
}
