import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Link } from '../../routes/transition-nav';
import Author from '../../components/forum/Author';
import { Icon } from '../../components/ui';
import { forumApi } from '../../services';
import type { ForumCategory, ForumSort, ForumThread, PageResult } from '../../types';
import { formatNumber, formatRelativeTime, t } from '../../i18n/core';
import { isGuest } from '../../utils/session';
import '../../components/scores/scores.css';
import './forum.css';

const PAGE_SIZE = 15;

/** Trang /forum: chuyên mục, tìm theo tiêu đề, lọc và sắp xếp chủ đề (mục 5.5). Trạng thái nằm trên URL để chia sẻ được. */
export default function Forum() {
  const [params, setParams] = useSearchParams();
  const categoryId = params.get('category') ?? '';
  const keywordParam = params.get('q') ?? '';
  const sort: ForumSort = params.get('sort') === 'TOP' ? 'TOP' : 'LATEST';
  const unanswered = params.get('unanswered') === '1';
  // Khách chỉ đọc: không có bộ lọc "của tôi" và nút đặt chủ đề dẫn tới đăng nhập
  const guest = isGuest();
  const mine = !guest && params.get('mine') === '1';
  const page = Math.max(0, Number(params.get('page')) || 0);

  const [keyword, setKeyword] = useState(keywordParam);
  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [result, setResult] = useState<PageResult<ForumThread> | null>(null);
  const [failed, setFailed] = useState(false);

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    if (!('page' in changes)) next.delete('page'); // đổi bộ lọc thì về trang đầu
    setParams(next, { replace: true });
  };

  useEffect(() => {
    forumApi
      .categories()
      .then((res) => setCategories(res.data.result))
      .catch(() => toast.error(t('forum.loadFailed')));
  }, []);

  // Gõ tìm kiếm: chờ ngừng gõ rồi mới đẩy lên URL
  useEffect(() => {
    if (keyword.trim() === keywordParam) return;
    const timer = setTimeout(() => update({ q: keyword.trim() || null }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword]);

  useEffect(() => {
    let cancelled = false;
    forumApi
      .threads({
        categoryId: categoryId || undefined,
        keyword: keywordParam || undefined,
        sort,
        unanswered,
        mine,
        page,
        size: PAGE_SIZE,
      })
      .then((res) => {
        if (!cancelled) {
          setResult(res.data.result);
          setFailed(false);
        }
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [categoryId, keywordParam, sort, unanswered, mine, page]);

  const total = categories.reduce((sum, c) => sum + c.threadCount, 0);

  return (
    <div className="sc-page">
      <main className="sc-container">
        <header className="fm-head">
          <div>
            <h1>{t('forum.title')}</h1>
            <p>{t('forum.subtitle')}</p>
          </div>
          {guest ? (
            <Link to="/auth/login" state={{ from: '/forum/new' }} className="sc-btn sc-btn--primary">
              {t('forum.guest.signInToPost')}
            </Link>
          ) : (
            <Link to={`/forum/new${categoryId ? `?category=${categoryId}` : ''}`} className="sc-btn sc-btn--primary">
              <Icon name="plus" size={16} />
              {t('forum.newThread')}
            </Link>
          )}
        </header>

        <section className="fm-controls">
          <nav className="fm-cats" aria-label={t('forum.categories')}>
            <button
              type="button"
              className={`fm-cat${categoryId === '' ? ' fm-cat--on' : ''}`}
              aria-pressed={categoryId === ''}
              onClick={() => update({ category: null })}
            >
              {t('forum.allCategories')} <span>{formatNumber(total)}</span>
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`fm-cat${categoryId === c.id ? ' fm-cat--on' : ''}`}
                aria-pressed={categoryId === c.id}
                title={c.description ?? undefined}
                onClick={() => update({ category: c.id })}
              >
                {c.name} <span>{formatNumber(c.threadCount)}</span>
              </button>
            ))}
          </nav>

          <div className="fm-toolbar">
            <label className="fm-search">
              <Icon name="search" size={16} />
              <input
                type="search"
                placeholder={t('forum.search')}
                aria-label={t('forum.search')}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </label>
            <div className="fm-filters">
              <button
                type="button"
                className={`fm-chip${unanswered ? ' fm-chip--on' : ''}`}
                aria-pressed={unanswered}
                onClick={() => update({ unanswered: unanswered ? null : '1' })}
              >
                {t('forum.unanswered')}
              </button>
              {!guest && (
                <button
                  type="button"
                  className={`fm-chip${mine ? ' fm-chip--on' : ''}`}
                  aria-pressed={mine}
                  onClick={() => update({ mine: mine ? null : '1' })}
                >
                  {t('forum.mine')}
                </button>
              )}
              <label className="fm-sort">
                <span className="fm-muted">{t('forum.sort.label')}</span>
                <select
                  className="sc-input"
                  value={sort}
                  onChange={(e) => update({ sort: e.target.value === 'TOP' ? 'TOP' : null })}
                >
                  <option value="LATEST">{t('forum.sort.latest')}</option>
                  <option value="TOP">{t('forum.sort.top')}</option>
                </select>
              </label>
            </div>
          </div>
        </section>

        {failed && (
          <div className="sc-empty">
            <h3>{t('forum.loadFailed')}</h3>
            <p>{t('forum.reload')}</p>
          </div>
        )}

        {!result && !failed && (
          <ul className="fm-list" aria-hidden="true">
            {Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="fm-row fm-row--skeleton" />
            ))}
          </ul>
        )}

        {result && result.content.length === 0 && (
          <div className="sc-empty">
            <h3>{t('forum.emptyTitle')}</h3>
            <p>{keywordParam || unanswered || mine || categoryId ? t('forum.emptyFiltered') : t('forum.emptyFirst')}</p>
          </div>
        )}

        {result && result.content.length > 0 && (
          <ul className="fm-list">
            {result.content.map((th) => (
              <li key={th.id}>
                <Link to={`/forum/threads/${th.id}`} className="fm-row">
                  <span className="fm-row__votes" aria-label={t('forum.votes', { count: th.voteCount })}>
                    <strong>{formatNumber(th.voteCount)}</strong>
                    <span>{t('forum.votesShort')}</span>
                  </span>
                  <span className="fm-row__main">
                    <span className="fm-row__title">{th.title}</span>
                    <span className="fm-row__excerpt">{th.excerpt}</span>
                    <span className="fm-row__meta">
                      {th.pinned && (
                        <span className="fm-tag fm-tag--pin">
                          <Icon name="star" size={12} /> {t('forum.pinned')}
                        </span>
                      )}
                      {th.locked && (
                        <span className="fm-tag">
                          <Icon name="lock" size={12} /> {t('forum.locked')}
                        </span>
                      )}
                      <span className="fm-tag">{th.categoryName}</span>
                      {th.answered && (
                        <span className="fm-tag fm-tag--ok">
                          <Icon name="check" size={12} /> {t('forum.answered')}
                        </span>
                      )}
                      {th.score && (
                        <span className="fm-tag">
                          <Icon name="music" size={12} /> {th.score.title}
                        </span>
                      )}
                      <Author author={th.author} size={20} />
                      <span className="fm-muted">{formatRelativeTime(th.lastActivityAt)}</span>
                    </span>
                  </span>
                  <span className="fm-row__replies">
                    <strong>{formatNumber(th.replyCount)}</strong>
                    <span>{t('forum.repliesShort')}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {result && result.totalPages > 1 && (
          <nav className="sc-pager" aria-label={t('common.pagination.label')}>
            <button
              type="button"
              className="sc-btn sc-btn--sm"
              disabled={page === 0}
              onClick={() => update({ page: page > 1 ? String(page - 1) : null })}
            >
              {t('common.pagination.prev')}
            </button>
            <span className="sc-pager__info">
              {t('common.pagination.page')} <strong>{page + 1}</strong> / {result.totalPages}
            </span>
            <button
              type="button"
              className="sc-btn sc-btn--sm"
              disabled={page + 1 >= result.totalPages}
              onClick={() => update({ page: String(page + 1) })}
            >
              {t('common.pagination.next')}
            </button>
          </nav>
        )}
      </main>
    </div>
  );
}
