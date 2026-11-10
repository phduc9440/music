import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ComposerPortrait from '../../components/composers/ComposerPortrait';
import { Icon } from '../../components/ui';
import { composerApi } from '../../services';
import type { Composer, ComposerPeriod } from '../../types';
import { PERIOD_LABELS, PERIODS, lifespan } from '../../utils/composer';
import '../../components/scores/scores.css';
import './composers.css';

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
            <h1>Nhạc sĩ</h1>
            <p>Những người viết nên các bản nhạc trong kho, từ thời Baroque tới nhạc Việt.</p>
          </div>
          <label className="cp-search">
            <Icon name="search" size={16} />
            <input
              placeholder="Tìm nhạc sĩ"
              aria-label="Tìm nhạc sĩ"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </header>

        <nav className="cp-tabs" aria-label="Thời kỳ">
          <button
            type="button"
            className={`cp-tab${period === null ? ' cp-tab--on' : ''}`}
            onClick={() => setParams({})}
          >
            Tất cả
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
            <h3>Không tải được danh sách nhạc sĩ</h3>
            <p>Thử tải lại trang.</p>
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
            <h3>Không có nhạc sĩ nào</h3>
            <p>{q ? 'Thử tìm bằng tên khác.' : 'Chưa có nhạc sĩ ở thời kỳ này.'}</p>
          </div>
        )}

        {list && shown.length > 0 && (
          <div className="cp-grid">
            {shown.map((c) => (
              <Link key={c.id} to={`/composers/${c.slug}`} className="cp-card">
                <span className="cp-card__portrait">
                  <ComposerPortrait name={c.name} imageUrl={c.imageUrl} />
                  {c.period && <span className="cp-card__period">{PERIOD_LABELS[c.period]}</span>}
                </span>
                <span className="cp-card__body">
                  <strong>{c.name}</strong>
                  <span>{[lifespan(c), c.country].filter(Boolean).join(' · ')}</span>
                  <span className="cp-card__count">
                    {c.scoreCount > 0 ? `${c.scoreCount} bản công khai` : 'Chưa có bản công khai'}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
