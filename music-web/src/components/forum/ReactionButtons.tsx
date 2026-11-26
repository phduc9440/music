import { Icon } from '../ui';
import { formatNumber, t } from '../../i18n/core';
import type { ForumReaction } from '../../types/forum';

interface Props {
  likeCount: number;
  dislikeCount: number;
  myReaction: ForumReaction | null;
  /** Bài của chính mình: hiện số lượt nhưng không bấm được. */
  own?: boolean;
  /** Khách chưa đăng nhập: chỉ xem số lượt. */
  readOnly?: boolean;
  busy?: boolean;
  onReact: (reaction: ForumReaction) => void;
}

/**
 * Cột thích / không thích bên trái bài viết. Bấm lại đúng lựa chọn đang có là gỡ, bấm nút kia là đổi. Mỗi nút cao tối
 * thiểu 44px; nhãn cho trình đọc màn hình đọc cả hành động lẫn số lượt.
 */
export default function ReactionButtons({ likeCount, dislikeCount, myReaction, own, readOnly, busy, onReact }: Props) {
  const label = (reaction: ForumReaction, count: number) => {
    const kind = reaction === 'LIKE' ? 'like' : 'dislike';
    if (readOnly) return t(`forum.reaction.${kind}Readonly`, { count });
    if (own) return t(`forum.reaction.${kind}Own`, { count });
    return t(`forum.reaction.${kind}${myReaction === reaction ? 'Remove' : 'Add'}`, { count });
  };
  const button = (reaction: ForumReaction, count: number) => {
    const on = myReaction === reaction;
    return (
      <button
        type="button"
        className={`fm-react__btn fm-react__btn--${reaction === 'LIKE' ? 'like' : 'dislike'}${on ? ' is-on' : ''}`}
        aria-pressed={on}
        aria-label={label(reaction, count)}
        disabled={own || readOnly || busy}
        onClick={() => onReact(reaction)}
      >
        <Icon name={reaction === 'LIKE' ? 'thumbsUp' : 'thumbsDown'} size={16} />
        <span>{formatNumber(count)}</span>
      </button>
    );
  };
  return (
    <div className="fm-react" role="group" aria-label={t('forum.reaction.group')}>
      {button('LIKE', likeCount)}
      {button('DISLIKE', dislikeCount)}
    </div>
  );
}
