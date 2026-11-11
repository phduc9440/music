import { MAX_KEYWORD } from '../../../utils/score';
import type { Difficulty, ProcessingStatus, ScoreSort, ScoreSource, Tag } from '../../../types';
import { t } from '../../../i18n/core';

interface Props {
  keyword: string;
  status: ProcessingStatus | '';
  source: ScoreSource | '';
  difficulty: Difficulty | '';
  tags: Tag[];
  tagId: string;
  sort: ScoreSort;
  onKeyword: (v: string) => void;
  onStatus: (v: ProcessingStatus | '') => void;
  onSource: (v: ScoreSource | '') => void;
  onDifficulty: (v: Difficulty | '') => void;
  onTag: (v: string) => void;
  onSort: (v: ScoreSort) => void;
}

/** Thanh tìm kiếm + bộ lọc + sắp xếp. */
export default function ScoreFilters(p: Props) {
  return (
    <div className="sc-filters">
      <label className="sc-search">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          className="sc-input"
          placeholder={t('scores.filters.search')}
          value={p.keyword}
          maxLength={MAX_KEYWORD}
          onChange={(e) => p.onKeyword(e.target.value)}
        />
      </label>
      <select
        className="sc-input"
        aria-label={t('scores.filters.byStatus')}
        value={p.status}
        onChange={(e) => p.onStatus(e.target.value as ProcessingStatus | '')}
      >
        <option value="">{t('scores.filters.anyStatus')}</option>
        <option value="PENDING">{t('scores.labels.status.PENDING')}</option>
        <option value="PROCESSING">{t('scores.labels.status.PROCESSING')}</option>
        <option value="COMPLETED">{t('scores.labels.status.COMPLETED')}</option>
        <option value="FAILED">{t('scores.labels.status.FAILED')}</option>
      </select>
      <select
        className="sc-input"
        aria-label={t('scores.filters.bySource')}
        value={p.source}
        onChange={(e) => p.onSource(e.target.value as ScoreSource | '')}
      >
        <option value="">{t('scores.filters.anySource')}</option>
        <option value="OMR">{t('scores.labels.source.OMR')}</option>
        <option value="IMPORT">{t('scores.labels.source.IMPORT')}</option>
        <option value="MANUAL">{t('scores.labels.source.MANUAL')}</option>
      </select>
      <select
        className="sc-input"
        aria-label={t('scores.filters.byDifficulty')}
        value={p.difficulty}
        onChange={(e) => p.onDifficulty(e.target.value as Difficulty | '')}
      >
        <option value="">{t('scores.filters.anyDifficulty')}</option>
        <option value="EASY">{t('scores.labels.difficulty.EASY')}</option>
        <option value="MEDIUM">{t('scores.labels.difficulty.MEDIUM')}</option>
        <option value="HARD">{t('scores.labels.difficulty.HARD')}</option>
        <option value="EXPERT">{t('scores.labels.difficulty.EXPERT')}</option>
      </select>
      <select
        className="sc-input"
        aria-label={t('scores.filters.byTag')}
        value={p.tagId}
        onChange={(e) => p.onTag(e.target.value)}
      >
        <option value="">{t('scores.filters.anyTag')}</option>
        {p.tags.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <select
        className="sc-input"
        aria-label={t('scores.explore.sortBy')}
        value={p.sort}
        onChange={(e) => p.onSort(e.target.value as ScoreSort)}
      >
        <option value="newest">{t('scores.filters.sort.newest')}</option>
        <option value="created">{t('scores.filters.sort.created')}</option>
        <option value="oldest">{t('scores.filters.sort.oldest')}</option>
        <option value="title">{t('scores.filters.sort.title')}</option>
      </select>
    </div>
  );
}
