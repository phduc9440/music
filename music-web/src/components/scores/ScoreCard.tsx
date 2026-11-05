import AuthImage from './AuthImage';
import StatusBadge from './StatusBadge';
import { DIFFICULTY_LABELS, SOURCE_LABELS, formatRelative } from '../../utils/score';
import type { ScoreSummary } from '../../types';

interface Props {
  score: ScoreSummary;
  onOpen: (score: ScoreSummary) => void;
}

/** Một thẻ bản nhạc trong lưới thư viện. */
export default function ScoreCard({ score, onOpen }: Props) {
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
        <div className="sc-card__status">
          <StatusBadge status={score.processingStatus} />
        </div>
      </div>
      <div className="sc-card__body">
        <h3 className="sc-card__title" title={score.title}>
          {score.title}
        </h3>
        <p className="sc-card__composer">{score.composer || 'Chưa rõ tác giả'}</p>
        <div className="sc-card__chips">
          {score.sourceType && <span className="sc-chip sc-chip--accent">{SOURCE_LABELS[score.sourceType]}</span>}
          {score.difficulty && <span className="sc-chip">{DIFFICULTY_LABELS[score.difficulty]}</span>}
          {score.visibility === 'PUBLIC' && <span className="sc-chip">Công khai</span>}
          {score.tags?.map((t) => (
            <span key={t.id} className="sc-chip sc-chip--tag">
              {t.name}
            </span>
          ))}
        </div>
        <div className="sc-card__foot">
          <span>{score.measureCount ? `${score.measureCount} ô nhịp` : '—'}</span>
          <span>{formatRelative(score.updatedAt)}</span>
        </div>
      </div>
    </article>
  );
}
