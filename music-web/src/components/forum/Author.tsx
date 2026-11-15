import type { ForumAuthor } from '../../types';
import { t } from '../../i18n/core';

/** Ảnh đại diện (hoặc chữ cái đầu) và tên người viết. */
export default function Author({ author, size = 28 }: { author: ForumAuthor; size?: number }) {
  const name = author.fullName || t('forum.anonymous');
  return (
    <span className="fm-author">
      {author.avatarUrl ? (
        <img className="fm-avatar" src={author.avatarUrl} alt="" width={size} height={size} loading="lazy" />
      ) : (
        <span className="fm-avatar fm-avatar--letter" style={{ width: size, height: size }} aria-hidden="true">
          {name.trim().charAt(0).toUpperCase()}
        </span>
      )}
      <span className="fm-author__name">{name}</span>
    </span>
  );
}
