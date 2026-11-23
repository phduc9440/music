import type { MouseEvent } from 'react';
import { useViewTransitionState } from 'react-router-dom';
import AuthImage from '../common/AuthImage';
import StatusBadge from '../common/StatusBadge';
import { API_BASE_URL } from '../../../services';
import { t } from '../../../i18n/core';
import { isGuest } from '../../../utils/session';
import { ACCESS_LEVEL_LABELS, DIFFICULTY_LABELS, SOURCE_LABELS, formatRelative } from '../../../utils/score';
import type { ScoreSummary } from '../../../types';
import VisibilityBadge from '../common/VisibilityBadge';
import Icon from '../../ui/Icon';
import './score-card.css';

interface Props {
  score: ScoreSummary;
  onOpen: (score: ScoreSummary) => void;
  /** Bản của chính người xem ("Bản nhạc của tôi"): hiện nhãn quyền riêng tư và trạng thái xử lý trên ảnh bìa. */
  owned?: boolean;
  /**
   * Mở menu thao tác nhanh của thẻ tại điểm màn hình (chuột phải, nút ⋯, phím Menu / Shift+F10). Không có thì thẻ giữ
   * menu chuột phải mặc định của trình duyệt.
   */
  onMenu?: (score: ScoreSummary, point: { x: number; y: number }) => void;
}

/** Ảnh thẻ: khách chưa đăng nhập không tải được /api/files/** nên dùng ảnh trang 1 công khai của bản PUBLIC. */
const cardImage = (score: ScoreSummary): string | null | undefined =>
  score.coverUrl ??
  (isGuest() && score.thumbnailUrl ? `${API_BASE_URL}/public/scores/${score.id}/thumbnail` : score.thumbnailUrl);

/** Dòng "ai làm ra / ai chia sẻ" dưới tên tác giả; thẻ của chính mình thì không cần. */
const byline = (score: ScoreSummary): string | null => {
  if (score.arrangerName) return t('scores.card.arrangedBy', { name: score.arrangerName });
  const owner = score.ownerName ?? (score.accessLevel ? score.ownerEmail : null);
  return owner ? t('scores.card.sharedBy', { name: owner }) : null;
};

/**
 * Một thẻ bản nhạc, dùng chung cho mọi danh sách (Bản nhạc của tôi, Khám phá, Nhạc mẫu, Được chia sẻ, trang nhạc sĩ) để
 * các trang trông và dùng giống nhau: ảnh bìa + nút ⋯, tên, tác giả, nhãn, rồi hàng số liệu (lượt xem, điểm sao, số ô
 * nhịp, lần cập nhật).
 */
export default function ScoreCard({ score, onOpen, owned = false, onMenu }: Props) {
  // Đang chuyển sang trang bản nhạc này: ảnh bìa mang tên dùng chung để "bay" sang vị trí mới (View Transitions)
  const opening = useViewTransitionState(`/scores/${score.id}`);
  const openMenuAt = (e: MouseEvent<HTMLElement>) => {
    if (!onMenu) return;
    e.preventDefault();
    e.stopPropagation();
    onMenu(score, { x: e.clientX, y: e.clientY });
  };
  const by = byline(score);
  const rated = score.ratingAverage != null;
  return (
    <article
      // Không đổi className theo trạng thái: hiệu ứng hiện dần gắn class `reveal--in` trực tiếp vào thẻ, React ghi đè
      // className sẽ làm mất class đó và thẻ biến mất. Trạng thái "đang mở menu" đặt ở ô bọc ngoài (ScoreGrid).
      className="sc-card reveal-item"
      role="button"
      tabIndex={0}
      aria-haspopup={onMenu ? 'menu' : undefined}
      onClick={() => onOpen(score)}
      onContextMenu={onMenu ? openMenuAt : undefined}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(score);
        } else if (onMenu && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) {
          e.preventDefault();
          const box = e.currentTarget.getBoundingClientRect();
          onMenu(score, { x: box.left + 24, y: box.top + 24 });
        }
      }}
    >
      <div className="sc-card__cover" style={opening ? { viewTransitionName: 'ui-shared-cover' } : undefined}>
        <AuthImage src={cardImage(score)} alt={score.title} className="sc-card__img" />
        {onMenu && (
          <button
            type="button"
            className="sc-card__menu"
            aria-label={t('scores.libMenu.open', { title: score.title })}
            title={t('scores.libMenu.openTitle')}
            onClick={(e) => {
              e.stopPropagation();
              const box = e.currentTarget.getBoundingClientRect();
              onMenu(score, { x: box.right - 4, y: box.bottom + 4 });
            }}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Icon name="more" size={18} />
          </button>
        )}
        {owned && (
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
        {by && (
          <p className="sc-card__by" title={by}>
            {by}
          </p>
        )}
        <div className="sc-card__chips">
          {score.sourceType && <span className="sc-chip sc-chip--accent">{SOURCE_LABELS[score.sourceType]}</span>}
          {score.difficulty && <span className="sc-chip">{DIFFICULTY_LABELS[score.difficulty]}</span>}
          {score.accessLevel && (
            <span className="sc-chip sc-chip--accent">{ACCESS_LEVEL_LABELS[score.accessLevel]}</span>
          )}
          {score.tags?.map((tag) => (
            <span key={tag.id} className="sc-chip sc-chip--tag">
              {tag.name}
            </span>
          ))}
        </div>
        <div className="sc-card__foot">
          <span className="sc-card__stat" title={t('scores.card.viewsTitle')}>
            <Icon name="eye" size={13} />
            {score.viewCount ?? 0}
            <span className="sc-sr">{t('scores.card.viewsTitle')}</span>
          </span>
          <span
            className={`sc-card__stat${rated ? ' sc-card__stat--rated' : ''}`}
            title={rated ? t('scores.card.ratingTitle') : t('scores.card.noRating')}
          >
            <Icon name="star" size={13} />
            {rated ? `${score.ratingAverage!.toFixed(1)} (${score.ratingCount ?? 0})` : '—'}
            <span className="sc-sr">{rated ? t('scores.card.ratingTitle') : t('scores.card.noRating')}</span>
          </span>
          {score.measureCount ? (
            <span className="sc-card__stat" title={t('scores.card.measures', { count: score.measureCount })}>
              <Icon name="music" size={13} />
              {score.measureCount}
              <span className="sc-sr">{t('scores.card.measures', { count: score.measureCount })}</span>
            </span>
          ) : null}
          <span className="sc-card__time">{formatRelative(score.updatedAt)}</span>
        </div>
      </div>
    </article>
  );
}
