import type { MouseEvent, ReactNode } from 'react';
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

interface Props {
  score: ScoreSummary;
  onOpen: (score: ScoreSummary) => void;
  /** Thẻ ở trang Khám phá: ẩn nhãn quyền riêng tư và trạng thái xử lý (ai cũng thấy là công khai, đã xong). */
  explore?: boolean;
  /** Hiện số lượt xem (thư viện đang sắp theo "Nhiều lượt xem", để người dùng hiểu thứ tự). Trang Khám phá luôn hiện. */
  showViews?: boolean;
  /** Nút thêm ở cuối thẻ (ví dụ "Lưu vào playlist"); bấm vào không mở bản nhạc. */
  actions?: ReactNode;
  /**
   * Mở menu thao tác nhanh của thẻ tại điểm màn hình (chuột phải, nút ⋯, phím Menu / Shift+F10). Không có thì thẻ giữ
   * menu chuột phải mặc định của trình duyệt.
   */
  onMenu?: (score: ScoreSummary, point: { x: number; y: number }) => void;
  /** Thẻ đang mở menu: giữ viền nổi bật trong lúc menu còn mở. */
  menuOpen?: boolean;
}

/** Ảnh thẻ: khách chưa đăng nhập không tải được /api/files/** nên dùng ảnh trang 1 công khai của bản PUBLIC. */
const cardImage = (score: ScoreSummary): string | null | undefined =>
  score.coverUrl ??
  (isGuest() && score.thumbnailUrl ? `${API_BASE_URL}/public/scores/${score.id}/thumbnail` : score.thumbnailUrl);

/** Một thẻ bản nhạc trong lưới thư viện. */
export default function ScoreCard({
  score,
  onOpen,
  explore = false,
  showViews = false,
  actions,
  onMenu,
  menuOpen = false,
}: Props) {
  // Đang chuyển sang trang bản nhạc này: ảnh bìa mang tên dùng chung để "bay" sang vị trí mới (View Transitions)
  const opening = useViewTransitionState(`/scores/${score.id}`);
  const openMenuAt = (e: MouseEvent<HTMLElement>) => {
    if (!onMenu) return;
    e.preventDefault();
    e.stopPropagation();
    onMenu(score, { x: e.clientX, y: e.clientY });
  };
  return (
    <article
      className={`sc-card reveal-item${menuOpen ? ' is-menu-open' : ''}`}
      role="button"
      tabIndex={0}
      aria-haspopup={onMenu ? 'menu' : undefined}
      onClick={() => onOpen(score)}
      onContextMenu={onMenu ? openMenuAt : undefined}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') onOpen(score);
        else if (onMenu && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) {
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
        {(explore || showViews) && (
          <div className="sc-card__stats">
            <span title={t('scores.card.viewsTitle')}>{t('scores.card.views', { count: score.viewCount ?? 0 })}</span>
            {explore && (
              <span title={t('scores.card.ratingTitle')}>
                {score.ratingAverage != null
                  ? `★ ${score.ratingAverage.toFixed(1)} (${score.ratingCount ?? 0})`
                  : t('scores.card.noRating')}
              </span>
            )}
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
