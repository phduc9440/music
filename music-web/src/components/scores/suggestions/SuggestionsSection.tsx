import { useEffect, useState } from 'react';
import { Link } from '../../../routes/transition-nav';
import { toast } from 'react-toastify';
import { suggestionApi } from '../../../services';
import type { SuggestionFilter, SuggestionSummary } from '../../../types';
import { formatRelative, getErrorMessage, useScoreBase } from '../../../utils/score';
import { t } from '../../../i18n/core';
import Skeleton from '../../ui/Skeleton';
import { Icon } from '../../ui';
import ChordSuggestDialog from '../chords/ChordSuggestDialog';
import { aiChordsEditPath, clearChordsEditPath, statusTone, suggestionPath } from './suggestionUtils';
import { useNavigate } from '../../../routes/useTransitionNavigate';
import './suggestions.css';

const FILTERS: SuggestionFilter[] = ['OPEN', 'CLOSED', 'ALL'];

interface Props {
  scoreId: string;
  /** Sửa được bản nhạc: gợi ý hợp âm xong thì mở thẳng trình chỉnh sửa với hợp âm AI làm bản nháp. */
  canEdit?: boolean;
  /** Báo trang cha số đề xuất đang mở để hiện trên tab. */
  onOpenCount?: (count: number) => void;
  /** Số ô nhịp của bản nhạc, để hộp Gợi ý hợp âm báo trước giới hạn của gói. */
  measureCount?: number | null;
}

/** Tab "Đề xuất" của trang chi tiết bản nhạc (mục 4.3): danh sách đề xuất, lọc Đang mở / Đã đóng / Tất cả. */
export default function SuggestionsSection({ scoreId, canEdit = false, onOpenCount, measureCount }: Props) {
  const base = useScoreBase();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<SuggestionFilter>('OPEN');
  const [items, setItems] = useState<SuggestionSummary[] | null>(null);
  const [suggestingChords, setSuggestingChords] = useState(false);

  useEffect(() => {
    let cancelled = false;
    suggestionApi
      .list(scoreId, filter)
      .then((res) => {
        if (cancelled) return;
        setItems(res.data.result.content);
        if (filter === 'OPEN') onOpenCount?.(res.data.result.totalElements);
      })
      .catch((err) => {
        if (cancelled) return;
        setItems([]);
        toast.error(getErrorMessage(err, t('suggestions.section.loadFailed')));
      });
    return () => {
      cancelled = true;
    };
  }, [scoreId, filter, onOpenCount]);

  const changeFilter = (next: SuggestionFilter) => {
    if (next === filter) return;
    setItems(null);
    setFilter(next);
  };

  return (
    <div className="sg-section">
      <div className="sg-filters" role="group">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={`sg-filter${filter === f ? ' is-active' : ''}`}
            aria-pressed={filter === f}
            onClick={() => changeFilter(f)}
          >
            {t(`suggestions.filter.${f}`)}
          </button>
        ))}
        {canEdit && (
          <button
            type="button"
            className="sc-btn sc-btn--sm sg-filters__action"
            onClick={() => setSuggestingChords(true)}
            title={t('chords.buttonHint')}
          >
            <Icon name="music" size={14} />
            {t('chords.button')}
          </button>
        )}
      </div>
      {suggestingChords && (
        <ChordSuggestDialog
          scoreId={scoreId}
          measureCount={measureCount}
          onClose={() => setSuggestingChords(false)}
          onCompleted={canEdit ? (id) => navigate(aiChordsEditPath(base, scoreId, id)) : undefined}
          onClearAll={canEdit ? () => navigate(clearChordsEditPath(base, scoreId)) : undefined}
        />
      )}

      {items === null ? (
        <Skeleton height={64} />
      ) : items.length === 0 ? (
        <div className="sg-empty">
          <strong>{t('suggestions.section.empty')}</strong>
          <p>{t('suggestions.section.emptyHint')}</p>
        </div>
      ) : (
        <ul className="sg-list">
          {items.map((s) => (
            <li key={s.id} className="sg-item">
              <div className="sg-item__main">
                <Link className="sg-item__title" to={suggestionPath(base, scoreId, s.id)}>
                  {s.title}
                </Link>
                <div className="sg-item__meta">
                  {t('suggestions.section.by', { name: s.author?.name ?? t('suggestions.section.system') })} ·{' '}
                  {formatRelative(s.createdAt)} ·{' '}
                  {s.structural
                    ? t('suggestions.section.structural')
                    : t('suggestions.section.changes', { count: s.changeCount })}
                </div>
              </div>
              <div className="sg-item__side">
                {s.status === 'OPEN' && s.stale && (
                  <span className="sg-badge is-stale">{t('suggestions.section.stale')}</span>
                )}
                <span className={`sg-badge ${statusTone(s.status)}`}>{t(`suggestions.status.${s.status}`)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
