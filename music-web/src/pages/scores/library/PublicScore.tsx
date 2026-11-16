import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Link } from '../../../routes/transition-nav';
import AuthImage from '../../../components/scores/common/AuthImage';
import { Icon } from '../../../components/ui';
import { API_BASE_URL, scoreApi } from '../../../services';
import type { ScoreSummary } from '../../../types';
import { formatNumber, t } from '../../../i18n/core';
import { DIFFICULTY_LABELS } from '../../../utils/score';
import { isGuest } from '../../../utils/session';
import '../../../components/scores/scores.css';
import './public-score.css';

/**
 * Trang /s/:scoreId cho khách chưa đăng nhập (mục 5.2): thông tin một bản nhạc đang công khai và lời mời đăng nhập để mở,
 * nghe và tập. Người đã đăng nhập được chuyển thẳng sang trang chi tiết đầy đủ. Bản riêng tư, đang chờ duyệt hoặc đã xóa
 * báo không tìm thấy (BE không phân biệt, để không lộ bản có tồn tại).
 */
export default function PublicScore() {
  const { scoreId = '' } = useParams();
  const [score, setScore] = useState<ScoreSummary | null>(null);
  const [missing, setMissing] = useState(false);

  const guest = isGuest();
  useEffect(() => {
    if (!guest) return;
    let cancelled = false;
    scoreApi
      .publicCard(scoreId)
      .then((res) => !cancelled && setScore(res.data.result))
      .catch(() => !cancelled && setMissing(true));
    return () => {
      cancelled = true;
    };
  }, [scoreId, guest]);

  if (!guest) return <Navigate to={`/scores/${scoreId}`} replace />;

  const loginState = { from: `/scores/${scoreId}` };

  if (missing) {
    return (
      <div className="sc-page">
        <main className="sc-container">
          <div className="sc-empty">
            <h3>{t('publicScore.notFoundTitle')}</h3>
            <p>{t('publicScore.notFoundText')}</p>
            <Link to="/explore" className="sc-btn sc-btn--primary">
              {t('publicScore.backToExplore')}
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const image =
    score?.coverUrl ?? (score?.thumbnailUrl ? `${API_BASE_URL}/public/scores/${scoreId}/thumbnail` : null);

  return (
    <div className="sc-page">
      <div className="sc-backbar">
        <Link className="sc-backlink" to="/explore">
          ‹ {t('common.nav.items.publicScores')}
        </Link>
      </div>
      <main className="sc-container">
        {!score ? (
          <div className="ps-card ps-card--skeleton" aria-hidden="true" />
        ) : (
          <article className="ps">
            <div className="ps-card">
              <div className="ps-cover">
                <AuthImage src={image} alt={score.title} className="ps-cover__img" />
              </div>
              <div className="ps-body">
                <div className="ps-chips">
                  {score.difficulty && <span className="sc-chip">{DIFFICULTY_LABELS[score.difficulty]}</span>}
                  {score.tags?.map((tag) => (
                    <span key={tag.id} className="sc-chip sc-chip--tag">
                      {tag.name}
                    </span>
                  ))}
                </div>
                <h1>{score.title}</h1>
                <p className="ps-composer">{score.composer || t('scores.card.unknownComposer')}</p>
                <ul className="ps-facts">
                  {score.measureCount ? (
                    <li>
                      <Icon name="music" size={14} />
                      {t('scores.card.measures', { count: score.measureCount })}
                    </li>
                  ) : null}
                  <li>
                    <Icon name="eye" size={14} />
                    {t('scores.card.views', { count: score.viewCount ?? 0 })}
                  </li>
                  <li>
                    <Icon name="star" size={14} />
                    {score.ratingAverage != null
                      ? `${score.ratingAverage.toFixed(1)} (${formatNumber(score.ratingCount ?? 0)})`
                      : t('scores.card.noRating')}
                  </li>
                  {score.ownerName && (
                    <li>
                      <Icon name="users" size={14} />
                      {t('scores.card.sharedBy', { name: score.ownerName })}
                    </li>
                  )}
                </ul>
              </div>
            </div>

            <aside className="ps-cta" aria-label={t('publicScore.ctaTitle')}>
              <h2>{t('publicScore.ctaTitle')}</h2>
              <p>{t('publicScore.ctaText')}</p>
              <ul>
                <li>
                  <Icon name="play" size={14} />
                  {t('publicScore.perkPlay')}
                </li>
                <li>
                  <Icon name="edit" size={14} />
                  {t('publicScore.perkEdit')}
                </li>
                <li>
                  <Icon name="upload" size={14} />
                  {t('publicScore.perkDownload')}
                </li>
              </ul>
              <Link to="/auth/login" state={loginState} className="sc-btn sc-btn--primary">
                {t('publicScore.signIn')}
              </Link>
              <small>{t('publicScore.free')}</small>
            </aside>
          </article>
        )}
      </main>
    </div>
  );
}
