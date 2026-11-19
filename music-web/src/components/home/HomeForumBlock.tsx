import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from '../../routes/transition-nav';
import { Icon } from '../ui';
import { forumApi } from '../../services';
import type { ForumThread } from '../../types';
import { formatRelativeTime, t } from '../../i18n/core';
import './home-forum.css';

const SHOWN = 4;

/**
 * Khối "Diễn đàn" ở trang chủ: vài chủ đề có hoạt động mới nhất. Khách đọc qua API công khai (forumApi tự chọn). Không
 * tải được hoặc chưa có chủ đề nào thì ẩn cả khối (kể cả tiêu đề do `wrap` thêm), không chặn trang chủ.
 */
export default function HomeForumBlock({ wrap }: { wrap: (content: ReactNode) => ReactNode }) {
  const [threads, setThreads] = useState<ForumThread[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    forumApi
      .threads({ sort: 'LATEST', size: SHOWN })
      .then((res) => !cancelled && setThreads(res.data.result.content))
      .catch(() => !cancelled && setThreads([]));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!threads || threads.length === 0) return null;

  return wrap(
    <div className="hf">
      <ul className="hf__list">
        {threads.map((th) => (
          <li key={th.id}>
            <Link to={`/forum/threads/${th.id}`} className="hf__item">
              <span className="hf__main">
                <strong title={th.title}>{th.title}</strong>
                <span className="hf__meta">
                  {th.categoryName} · {formatRelativeTime(th.lastActivityAt)}
                </span>
              </span>
              <span className="hf__side">
                {th.answered && (
                  <span className="hf__answered">
                    <Icon name="check" size={14} />
                    {t('forum.answered')}
                  </span>
                )}
                <span className="hf__count">
                  <Icon name="chat" size={14} />
                  {th.replyCount}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link to="/forum" className="hf__all">
        {t('home.forum.viewAll')}
        <Icon name="chevronRight" size={14} />
      </Link>
    </div>,
  );
}
