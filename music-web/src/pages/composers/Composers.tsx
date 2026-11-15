import { useEffect, useState } from 'react';
import { useSearchParams, useViewTransitionState } from 'react-router-dom';
import { Link } from '../../routes/transition-nav';
import ComposerPortrait from '../../components/composers/ComposerPortrait';
import { Icon } from '../../components/ui';
import { composerApi } from '../../services';
import type { Composer, ComposerPeriod } from '../../types';
import { t } from '../../i18n/core';
import { PERIOD_LABELS, PERIODS, lifespan } from '../../utils/composer';
import '../../components/scores/scores.css';
import './composers.css';

/** Thẻ nhạc sĩ; khi đang mở trang của nhạc sĩ này, chân dung mang tên dùng chung để "bay" sang trang mới (View Transitions). */
function ComposerCard({ composer: c }: { composer: Composer }) {
  const opening = useViewTransitionState(`/composers/${c.slug}`);
  return (
    <Link to={`/composers/${c.slug}`} className="cp-card reveal-item">
      <span className="cp-card__portrait" style={opening ? { viewTransitionName: 'ui-shared-cover' } : undefined}>
        <ComposerPortrait name={c.name} imageUrl={c.imageUrl} />
        {c.period && <span className="cp-card__period">{PERIOD_LABELS[c.period]}</span>}
      </span>
      <span className="cp-card__body">
        <strong>{c.name}</strong>
        <span>{[lifespan(c), c.country].filter(Boolean).join(' · ')}</span>
        <span className="cp-card__count">
          {c.scoreCount > 0 ? t('composers.publicScores', { count: c.scoreCount }) : t('composers.noPublicScores')}
        </span>
      </span>
    </Link>
  );
}

/** Trang /composers: các nhạc sĩ, lọc theo thời kỳ và tên (mục 5.4). */
export default function Composers() {
  const [params, setParams] = useSearchParams();
  const periodParam = params.get('period') as ComposerPeriod | null;
  const period = periodParam && PERIODS.includes(periodParam) ? periodParam : null;
  const [query, setQuery] = useState('');
  const [list, setList] = useState<Composer[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    composerApi
      .list({ period: period ?? '', limit: 100 })
      .then((res) => {
        if (!cancelled) {
          setList(res.data.result);
          setFailed(false);
        }
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [period]);

  const q = query.trim().toLowerCase();
  const shown = (list ?? []).filter(
    (c) => !q || c.name.toLowerCase().includes(q) || (c.aliases ?? '').toLowerCase().includes(q),
  );

  return (
    <div className="sc-page">
      <main className="sc-container">
        <header className="cp-head">
          <div>
            <h1>{t('composers.title')}</h1>
            <p>{t('composers.subtitle')}</p>
          </div>
          <label className="cp-search">
            <Icon name="search" size={16} />
            <input
              placeholder={t('composers.search')}
              aria-label={t('composers.search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </header>

        <nav className="cp-tabs" aria-label={t('composers.period')}>
          <button
            type="button"
            className={`cp-tab${period === null ? ' cp-tab--on' : ''}`}
            onClick={() => setParams({})}
          >
            {t('composers.all')}
          </button>
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              className={`cp-tab${period === p ? ' cp-tab--on' : ''}`}
              aria-pressed={period === p}
              onClick={() => setParams({ period: p })}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </nav>

        {failed && (
          <div className="sc-empty">
            <h3>{t('composers.loadFailed')}</h3>
            <p>{t('composers.reload')}</p>
          </div>
        )}

        {!list && !failed && (
          <div className="cp-grid">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="cp-card cp-card--skeleton" aria-hidden="true" />
            ))}
          </div>
        )}

        {list && shown.length === 0 && (
          <div className="sc-empty">
            <h3>{t('composers.emptyTitle')}</h3>
            <p>{q ? t('composers.emptySearch') : t('composers.emptyPeriod')}</p>
          </div>
        )}

        {list && shown.length > 0 && (
          <div className="cp-grid">
            {shown.map((c) => (
              <ComposerCard key={c.id} composer={c} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
