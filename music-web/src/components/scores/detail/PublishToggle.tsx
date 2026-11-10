import { useState } from 'react';
import { toast } from 'react-toastify';
import { scoreApi } from '../../../services';
import type { ScoreDetail, Visibility } from '../../../types';
import { getErrorMessage } from '../../../utils/score';
import { Icon } from '../../ui';
import { useDialog } from '../../ui/dialog-context';

interface Props {
  score: ScoreDetail;
  /** Gọi với bản nhạc đã cập nhật để trang chi tiết hiện trạng thái mới. */
  onChanged: (score: ScoreDetail) => void;
}

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
  PRIVATE: {
    label: 'Công khai',
    icon: 'globe',
    target: 'PUBLIC',
    title: 'Gửi yêu cầu công khai bản nhạc này?',
    message:
      'Quản trị viên sẽ xem xét. Khi được duyệt, mọi người dùng đều xem được bản nhạc ở mục Khám phá. Bạn có thể chuyển về riêng tư bất cứ lúc nào.',
    confirm: 'Gửi yêu cầu',
    done: 'Đã gửi yêu cầu công khai, chờ quản trị viên duyệt',
  },
  PENDING: {
    label: 'Hủy yêu cầu công khai',
    icon: 'lock',
    target: 'PRIVATE',
    title: 'Hủy yêu cầu công khai?',
    message: 'Bản nhạc giữ ở chế độ riêng tư.',
    confirm: 'Hủy yêu cầu',
    done: 'Đã hủy yêu cầu công khai',
  },
  PUBLIC: {
    label: 'Chuyển về riêng tư',
    icon: 'lock',
    target: 'PRIVATE',
    title: 'Chuyển bản nhạc về riêng tư?',
    message:
      'Người khác sẽ không còn thấy bản nhạc này trong Khám phá. Những người bạn đã chia sẻ trực tiếp vẫn giữ quyền của họ. Muốn công khai lại phải gửi yêu cầu và chờ duyệt lần nữa.',
    confirm: 'Chuyển về riêng tư',
    done: 'Đã chuyển về riêng tư',
  },
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
      toast.error(getErrorMessage(error, 'Không đổi được chế độ hiển thị'));
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
