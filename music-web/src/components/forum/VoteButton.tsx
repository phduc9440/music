import { Icon } from '../ui';
import { formatNumber, t } from '../../i18n/core';

interface Props {
  count: number;
  voted: boolean;
  /** Bài của chính mình: hiện số phiếu nhưng không bấm được. */
  own?: boolean;
  busy?: boolean;
  onToggle: () => void;
}

/** Nút bình chọn dọc: mũi tên và số phiếu. Vùng chạm tối thiểu 44px. */
export default function VoteButton({ count, voted, own, busy, onToggle }: Props) {
  return (
    <button
      type="button"
      className={`fm-vote${voted ? ' fm-vote--on' : ''}`}
      aria-pressed={voted}
      aria-label={own ? t('forum.vote.own', { count }) : t(voted ? 'forum.vote.remove' : 'forum.vote.add', { count })}
      disabled={own || busy}
      onClick={onToggle}
    >
      <Icon name="chevronUp" size={16} />
      <span>{formatNumber(count)}</span>
    </button>
  );
}
