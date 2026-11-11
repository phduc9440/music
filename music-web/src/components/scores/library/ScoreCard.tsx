import type { ReactNode } from 'react';
import AuthImage from '../common/AuthImage';
import StatusBadge from '../common/StatusBadge';
import { t } from '../../../i18n/core';
import { ACCESS_LEVEL_LABELS, DIFFICULTY_LABELS, SOURCE_LABELS, formatRelative } from '../../../utils/score';
import type { ScoreSummary } from '../../../types';
import VisibilityBadge from '../common/VisibilityBadge';

interface Props {
  score: ScoreSummary;
  onOpen: (score: ScoreSummary) => void;
  /** Thẻ ở trang Khám phá: ẩn nhãn quyền riêng tư và trạng thái xử lý (ai cũng thấy là công khai, đã xong). */
  explore?: boolean;
  /** Nút thêm ở cuối thẻ (ví dụ "Lưu vào playlist"); bấm vào không mở bản nhạc. */
  actions?: ReactNode;
}

/** Một thẻ bản nhạc trong lưới thư viện. */
export default function ScoreCard({ score, onOpen, explore = false, actions }: Props) {
  return (
    <article
      className="sc-card"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(score)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen(score)}
    >
      <div className="sc-card__cover">
        <AuthImage src={score.thumbnailUrl} alt={score.title} className="sc-card__img" />
        {!explore && (
          <>
            <VisibilityBadge value={score.visibility} className="sc-card__visibility" />
            <div className="sc-card__status">
              <StatusBadge status={score.processingStatus} />
            </div>
          </>
        )}
      </div>
      <div className="sc-card__body">
        <h3 className="sc-card__title" title={score.title}>
          {score.title}
        </h3>
        <p className="sc-card__composer">{score.composer || t('scores.card.unknownComposer')}</p>
        {score.ownerEmail && score.accessLevel && (
          <p className="sc-card__composer">{t('scores.card.sharedBy', { name: score.ownerEmail })}</p>
        )}
        {score.arrangerName && (
          <p className="sc-card__composer">{t('scores.card.arrangedBy', { name: score.arrangerName })}</p>
        )}
        {explore && score.ownerName && (
          <p className="sc-card__composer">{t('scores.card.sharedBy', { name: score.ownerName })}</p>
        )}
        <div className="sc-card__chips">
          {score.sourceType && <span className="sc-chip sc-chip--accent">{SOURCE_LABELS[score.sourceType]}</span>}
          {score.difficulty && <span className="sc-chip">{DIFFICULTY_LABELS[score.difficulty]}</span>}
          {score.accessLevel && (
            <span className="sc-chip sc-chip--accent">{ACCESS_LEVEL_LABELS[score.accessLevel]}</span>
          )}
          {score.tags?.map((t) => (
            <span key={t.id} className="sc-chip sc-chip--tag">
              {t.name}
            </span>
          ))}
        </div>
        {explore && (
          <div className="sc-card__stats">
            <span title={t('scores.card.viewsTitle')}>{t('scores.card.views', { count: score.viewCount ?? 0 })}</span>
            <span title={t('scores.card.ratingTitle')}>
              {score.ratingAverage != null
                ? `★ ${score.ratingAverage.toFixed(1)} (${score.ratingCount ?? 0})`
                : t('scores.card.noRating')}
            </span>
          </div>
        )}
        <div className="sc-card__foot">
          <span>{score.measureCount ? t('scores.card.measures', { count: score.measureCount }) : '—'}</span>
          <span>{formatRelative(score.updatedAt)}</span>
        </div>
        {actions && (
          <div className="sc-card__actions" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
    </article>
  );
}
