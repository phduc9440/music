import { useEffect, useId, useState } from 'react';
import { Icon } from '../ui';
import { scoreApi } from '../../services';
import type { ScoreSummary } from '../../types';
import { t } from '../../i18n/core';

interface Props {
  value: { id: string; title: string } | null;
  onChange: (score: { id: string; title: string } | null) => void;
}

/** Chọn một bản nhạc công khai để gắn vào chủ đề: gõ tên để tìm trong Khám phá. */
export default function ScorePicker({ value, onChange }: Props) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ScoreSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const searching = query.trim().length >= 2;

  useEffect(() => {
    const keyword = query.trim();
    if (keyword.length < 2) return;
    let cancelled = false;
    // Chờ người dùng ngừng gõ một chút rồi mới gọi API
    const timer = setTimeout(() => {
      setLoading(true);
      scoreApi
        .explore({ keyword, size: 6 })
        .then((res) => !cancelled && setResults(res.data.result.content))
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setLoading(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  if (value) {
    return (
      <div className="fm-picked">
        <span className="sc-label">{t('forum.compose.score')}</span>
        <div className="fm-picked__row">
          <Icon name="music" size={16} />
          <strong>{value.title}</strong>
          <button type="button" className="sc-btn sc-btn--sm" onClick={() => onChange(null)}>
            {t('forum.compose.removeScore')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fm-picker">
      <label className="sc-label" htmlFor={id}>
        {t('forum.compose.score')} <span className="sc-counter">{t('forum.compose.optional')}</span>
      </label>
      <input
        id={id}
        className="sc-input"
        value={query}
        placeholder={t('forum.compose.scorePlaceholder')}
        onChange={(e) => setQuery(e.target.value)}
      />
      {searching && (
        <ul className="fm-picker__list" aria-live="polite">
          {loading && <li className="fm-muted">{t('forum.compose.searching')}</li>}
          {!loading && results.length === 0 && <li className="fm-muted">{t('forum.compose.noScore')}</li>}
          {results.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="fm-picker__item"
                onClick={() => {
                  onChange({ id: s.id, title: s.title });
                  setQuery('');
                }}
              >
                <strong>{s.title}</strong>
                {s.composer && <span className="fm-muted"> · {s.composer}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
