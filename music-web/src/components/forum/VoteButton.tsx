import { Icon } from '../ui';
import { formatNumber, t } from '../../i18n/core';

interface Props {
  count: number;
  voted: boolean;
  /** Bài của chính mình: hiện số phiếu nhưng không bấm được. */
  own?: boolean;
  /** Khách chưa đăng nhập: chỉ xem số phiếu. */
  readOnly?: boolean;
  busy?: boolean;
  onToggle: () => void;
}

/** Nút bình chọn dọc: mũi tên và số phiếu. Vùng chạm tối thiểu 44px. */
export default function VoteButton({ count, voted, own, readOnly, busy, onToggle }: Props) {
  return (
    <button
      type="button"
      className={`fm-vote${voted ? ' fm-vote--on' : ''}`}
      aria-pressed={voted}
      aria-label={
        readOnly
          ? t('forum.vote.readonly', { count })
          : own
            ? t('forum.vote.own', { count })
            : t(voted ? 'forum.vote.remove' : 'forum.vote.add', { count })
      }
      disabled={own || readOnly || busy}
      onClick={onToggle}
    >
      <Icon name="chevronUp" size={16} />
      <span>{formatNumber(count)}</span>
    </button>
  );
}
