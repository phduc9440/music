import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import AuthImage from '../../components/scores/common/AuthImage';
import { CREATE_SCORE_PATH } from '../../components/layout/nav';
import { Icon } from '../../components/ui';
import type { IconName } from '../../components/ui';
import { homeApi } from '../../services';
import type { HomePendingItem, HomeSummary, ScoreSummary } from '../../types';
import { t } from '../../i18n/core';
import { ACCESS_LEVEL_LABELS, DIFFICULTY_LABELS, formatRelative, getScorePath } from '../../utils/score';
import '../../components/scores/scores.css';
import './workspace-home.css';

const QUICK_LINKS: { to: string; labelKey: string; icon: IconName }[] = [
  { to: '/explore', labelKey: 'common.nav.items.publicScores', icon: 'globe' },
  { to: '/scores/official', labelKey: 'common.nav.items.officialLibrary', icon: 'library' },
  { to: '/practice-stats', labelKey: 'common.footer.practiceStats', icon: 'chart' },
  { to: '/playlists', labelKey: 'common.nav.items.playlists', icon: 'list' },
];

const greeting = () => {
  const h = new Date().getHours();
  if (h < 11) return t('home.workspace.greeting.morning');
  if (h < 14) return t('home.workspace.greeting.noon');
  if (h < 18) return t('home.workspace.greeting.afternoon');
  return t('home.workspace.greeting.evening');
};

const minutes = (seconds: number) => Math.floor(seconds / 60);

/** Đường tới nơi xử lý một việc đang chờ: yêu cầu xin quyền nằm ở trang chi tiết, lời xin vào kho mẫu có trang riêng. */
const pendingTarget = (item: HomePendingItem) =>
  item.type === 'ACCESS_REQUEST' ? `/scores/${item.scoreId}` : '/scores/official-requests';

const pendingText = (item: HomePendingItem) =>
  item.type === 'ACCESS_REQUEST'
    ? t('home.workspace.pendingAccess', {
        name: item.actorName ?? t('home.workspace.someone'),
        level: item.permission ? ACCESS_LEVEL_LABELS[item.permission].toLowerCase() : t('home.workspace.accessGeneric'),
      })
    : t('home.workspace.pendingOfficial', { name: item.actorName ?? t('home.workspace.adminName') });

function Panel({
  title,
  action,
  children,
  className = '',
}: {
  title: string;
  action?: { to: string; label: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`wh-panel ${className}`}>
      <header className="wh-panel__head">
        <h2>{title}</h2>
        {action && (
          <Link to={action.to} className="wh-panel__action">
            {action.label}
            <Icon name="chevronRight" size={14} />
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

function RecentRow({ score, from }: { score: ScoreSummary; from: string }) {
  return (
    <li>
      <Link to={getScorePath(score.id, score.processingStatus)} state={{ from }} className="wh-recent">
        <span className="wh-recent__thumb">
          <AuthImage src={score.thumbnailUrl} alt={score.title} className="wh-recent__img" />
        </span>
        <span className="wh-recent__body">
          <strong title={score.title}>{score.title}</strong>
          <span>
            {score.composer || t('scores.card.unknownComposer')} ·{' '}
            {t('home.workspace.updated', { when: formatRelative(score.updatedAt) })}
          </span>
        </span>
        <Icon name="chevronRight" size={16} />
      </Link>
    </li>
  );
}

/**
 * Trang làm việc của người đã đăng nhập (/, mục 5.3): lời chào và chuỗi ngày, bản gần đây, việc chờ xử lý, gợi ý luyện
 * tập. Các khối Show, góp ý, hoạt động team sẽ thêm khi có tính năng đó (4.1, 4.2).
 */
export default function WorkspaceHome() {
  const { pathname } = useLocation();
  const [data, setData] = useState<HomeSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    homeApi
      .summary()
      .then((res) => !cancelled && setData(res.data.result))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <div className="sc-page">
        <main className="sc-container">
          <div className="sc-empty">
            <h3>{t('home.workspace.loadFailedTitle')}</h3>
            <p>{t('home.workspace.loadFailedText')}</p>
          </div>
        </main>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="sc-page">
        <main className="sc-container wh" aria-busy="true">
          <div className="wh-skeleton wh-skeleton--hero" />
          <div className="wh-grid">
            <div className="wh-skeleton" />
            <div className="wh-skeleton" />
          </div>
        </main>
      </div>
    );
  }

  const { streak } = data;
  // Câu có một liên kết ở giữa: chuỗi dịch ghi {link} tại chỗ đặt liên kết
  const suggestEmpty = t('home.workspace.suggestEmpty').split('{link}');
  const todayMinutes = minutes(data.todayPracticeSeconds);
  const suggestion = data.suggestion;

  return (
    <div className="sc-page">
      <main className="sc-container wh">
        <header className="wh-hero">
          <div>
            <p className="wh-hero__eyebrow">{greeting()},</p>
            <h1>{data.displayName}</h1>
            <p className="wh-hero__sub">
              {streak.practicedToday
                ? t('home.workspace.practicedToday', { count: todayMinutes })
                : streak.currentStreak > 0
                  ? t('home.workspace.keepStreak')
                  : t('home.workspace.startStreak')}
            </p>
          </div>
          <Link to="/practice-stats" className="wh-streak" title={t('common.footer.practiceStats')}>
            <Icon name="flame" size={26} />
            <span className="wh-streak__num">{streak.currentStreak}</span>
            <span className="wh-streak__label">
              {t('home.workspace.streakLabel', { count: streak.currentStreak })}
              <small>{t('home.workspace.longest', { count: streak.longestStreak })}</small>
            </span>
          </Link>
        </header>

        <div className="wh-grid">
          <div className="wh-col">
            <Panel
              title={t('home.workspace.continue')}
              action={{ to: '/scores', label: t('common.nav.items.library') }}
            >
              {data.recentScores.length === 0 ? (
                <p className="wh-empty">{t('home.workspace.noScores')}</p>
              ) : (
                <ul className="wh-list">
                  {data.recentScores.map((s) => (
                    <RecentRow key={s.id} score={s} from={pathname} />
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title={t('home.workspace.digitize')}>
              <div className="wh-create">
                <Link to={CREATE_SCORE_PATH} className="wh-create__item">
                  <Icon name="upload" size={22} />
                  <strong>{t('home.workspace.fromImage')}</strong>
                  <span>{t('home.workspace.fromImageHint')}</span>
                </Link>
                <Link to="/scores/import" className="wh-create__item">
                  <Icon name="music" size={22} />
                  <strong>{t('home.workspace.fromFile')}</strong>
                  <span>{t('home.workspace.fromFileHint')}</span>
                </Link>
              </div>
            </Panel>
          </div>

          <div className="wh-col">
            <Panel title={t('home.workspace.pending')}>
              {data.pending.length === 0 ? (
                <p className="wh-empty">{t('home.workspace.noPending')}</p>
              ) : (
                <ul className="wh-list">
                  {data.pending.map((item) => (
                    <li key={`${item.type}-${item.scoreId}-${item.createdAt}`}>
                      <Link to={pendingTarget(item)} state={{ from: pathname }} className="wh-pending">
                        <span className={`wh-pending__dot wh-pending__dot--${item.type.toLowerCase()}`} />
                        <span className="wh-pending__body">
                          <strong>{pendingText(item)}</strong>
                          <span>
                            {item.scoreTitle} · {formatRelative(item.createdAt)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {(data.accessRequestCount > 0 || data.officialRequestCount > 0 || data.pendingPublicCount > 0) && (
                <p className="wh-counts">
                  {data.accessRequestCount > 0 && (
                    <span>{t('home.workspace.accessRequests', { count: data.accessRequestCount })}</span>
                  )}
                  {data.officialRequestCount > 0 && (
                    <span>{t('home.workspace.officialRequests', { count: data.officialRequestCount })}</span>
                  )}
                  {data.pendingPublicCount > 0 && (
                    <span>{t('home.workspace.awaitingReview', { count: data.pendingPublicCount })}</span>
                  )}
                </p>
              )}
            </Panel>

            <Panel title={t('home.workspace.suggestion')}>
              {suggestion ? (
                <div className="wh-suggest">
                  <div>
                    <span className="wh-suggest__reason">
                      {suggestion.reason === 'CONTINUE'
                        ? t('home.workspace.suggestContinue')
                        : t('home.workspace.suggestOfficial')}
                    </span>
                    <strong>{suggestion.score.title}</strong>
                    <span className="wh-suggest__meta">
                      {suggestion.score.composer || t('scores.card.unknownComposer')}
                      {suggestion.score.difficulty && ` · ${DIFFICULTY_LABELS[suggestion.score.difficulty]}`}
                    </span>
                  </div>
                  <Link to={`/scores/${suggestion.score.id}/play`} className="sc-btn sc-btn--primary">
                    <Icon name="play" size={16} />
                    {t('home.workspace.practiceNow')}
                  </Link>
                </div>
              ) : (
                <p className="wh-empty">
                  {suggestEmpty[0]}
                  <Link to="/scores/official">{t('common.nav.items.officialLibrary')}</Link>
                  {suggestEmpty[1]}
                </p>
              )}
            </Panel>

            <nav className="wh-quick" aria-label={t('home.workspace.quickLinks')}>
              {QUICK_LINKS.map((l) => (
                <Link key={l.to} to={l.to} className="wh-quick__item">
                  <Icon name={l.icon} size={18} />
                  {t(l.labelKey)}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </main>
    </div>
  );
}
