import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Link } from '../../routes/transition-nav';
import AuthImage from '../../components/scores/common/AuthImage';
import { CREATE_SCORE_PATH } from '../../components/layout/nav';
import { Icon } from '../../components/ui';
import CountUp from '../../components/ui/CountUp';
import type { IconName } from '../../components/ui';
import { homeApi, teamApi } from '../../services';
import type { HomePendingItem, HomeSummary, ScoreSummary, TeamTask } from '../../types';
import { DueDate, StatusBadge } from '../teams/shared';
import HomeForumBlock from '../../components/home/HomeForumBlock';
import SiteFooter from '../../components/layout/SiteFooter';
import SectionDots from '../../components/home/SectionDots';
import { useScreenSnap } from '../../components/home/useScreenSnap';
import { t } from '../../i18n/core';
import { ACCESS_LEVEL_LABELS, DIFFICULTY_LABELS, formatRelative, getScorePath } from '../../utils/score';
import '../../components/scores/scores.css';
import '../teams/teams.css';
import './workspace-home.css';

// Khuông nhạc 3D làm nền (three.js) tải riêng sau khi trang hiện
const ScoreStaff3D = lazy(() => import('../../components/home/ScoreStaff3D'));

/** Số việc hiện trên trang chủ; xem hết ở trang Team. */
const MAX_TASKS = 4;

const QUICK_LINKS: { to: string; labelKey: string; icon: IconName }[] = [
  { to: '/explore', labelKey: 'common.nav.items.publicScores', icon: 'globe' },
  { to: '/scores/official', labelKey: 'common.nav.items.officialLibrary', icon: 'library' },
  { to: '/practice-stats', labelKey: 'common.footer.practiceStats', icon: 'chart' },
  { to: '/playlists', labelKey: 'common.nav.items.playlists', icon: 'list' },
];

const SHOWCASE: { key: string; to: string; icon: IconName }[] = [
  { key: 'ocr', to: CREATE_SCORE_PATH, icon: 'upload' },
  { key: 'editor', to: '/scores', icon: 'pencil' },
  { key: 'player', to: '/scores', icon: 'play' },
  { key: 'practice', to: '/practice-history', icon: 'activity' },
  { key: 'teams', to: '/teams', icon: 'users' },
  { key: 'export', to: '/scores', icon: 'share' },
];

const JOURNEY: { key: 'capture' | 'edit' | 'practice'; to: string }[] = [
  { key: 'capture', to: CREATE_SCORE_PATH },
  { key: 'edit', to: '/scores' },
  { key: 'practice', to: '/practice-history' },
];

/** Khối có tiêu đề: tiêu đề và lời dẫn một hàng, nội dung là các thẻ phẳng bên dưới (như trang chủ khách). */
function Showcase({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <section className="wh-sec scr" data-screen={title}>
      <header className="wh-sec__head">
        <h2 className="scr-title">{title}</h2>
        {lead && <p>{lead}</p>}
      </header>
      {children}
    </section>
  );
}

const greeting = () => {
  const h = new Date().getHours();
  if (h < 11) return t('home.workspace.greeting.morning');
  if (h < 14) return t('home.workspace.greeting.noon');
  if (h < 18) return t('home.workspace.greeting.afternoon');
  return t('home.workspace.greeting.evening');
};

const minutes = (seconds: number) => Math.floor(seconds / 60);

/** Đường tới nơi xử lý một việc đang chờ: yêu cầu xin quyền nằm ở tab Cài đặt của trang chi tiết, lời xin vào kho mẫu có trang riêng. */
const pendingTarget = (item: HomePendingItem) =>
  item.type === 'ACCESS_REQUEST' ? `/scores/${item.scoreId}?tab=settings` : '/scores/official-requests';

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
          <AuthImage src={score.coverUrl ?? score.thumbnailUrl} alt={score.title} className="wh-recent__img" />
        </span>
        <span className="wh-recent__body">
          <strong title={score.title}>{score.title}</strong>
          <span className="wh-meta">
            <span>{score.composer || t('scores.card.unknownComposer')}</span>
            <span>{t('home.workspace.updated', { when: formatRelative(score.updatedAt) })}</span>
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
  const pageRef = useRef<HTMLDivElement>(null);
  // mỗi màn một section, hít vào ngay dưới thanh đầu trang của ứng dụng
  useScreenSnap('var(--ui-header-h)');
  const [data, setData] = useState<HomeSummary | null>(null);
  const [failed, setFailed] = useState(false);
  // Việc được giao trong các buổi diễn (4.1): tải riêng để lỗi ở đây không làm hỏng cả trang chủ
  const [tasks, setTasks] = useState<TeamTask[]>([]);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let cancelled = false;
    teamApi
      .myTasks()
      .then((res) => {
        if (cancelled) return;
        // Hạn gần nhất trước, bài chưa có hạn xuống cuối
        const sorted = [...res.data.result].sort((a, b) => {
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate.localeCompare(b.dueDate);
        });
        setNow(Date.now());
        setTasks(sorted);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

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

  const [featured, ...others] = data.recentScores;

  return (
    <div ref={pageRef} className="sc-page wh-page">
      <Suspense fallback={null}>
        <ScoreStaff3D />
      </Suspense>
      <SectionDots root={pageRef} label={t('home.guest.screensNav')} />
      <main className="sc-container wh">
        {/* màn đầu: lời chào và bàn làm việc (bento) */}
        <section className="wh-desk scr" data-screen={t('home.workspace.screenDesk')}>
          <header className="wh-hero">
            <div className="wh-hero__text">
              <h1>
                {greeting()}, {data.displayName}
              </h1>
              <p className="wh-hero__sub">
                {streak.practicedToday
                  ? t('home.workspace.practicedToday', { count: todayMinutes })
                  : streak.currentStreak > 0
                    ? t('home.workspace.keepStreak')
                    : t('home.workspace.startStreak')}
              </p>
              <div className="wh-hero__cta">
                {featured ? (
                  <Link
                    to={getScorePath(featured.id, featured.processingStatus)}
                    state={{ from: pathname }}
                    className="wh-btn"
                  >
                    <Icon name="play" size={18} />
                    {t('home.workspace.continue')}
                  </Link>
                ) : (
                  <Link to={CREATE_SCORE_PATH} className="wh-btn">
                    <Icon name="upload" size={18} />
                    {t('home.workspace.digitize')}
                  </Link>
                )}
              </div>
            </div>
            <Link to="/practice-stats" className="wh-streak" title={t('common.footer.practiceStats')}>
              <Icon name="flame" size={30} />
              <span className="wh-streak__num">
                <CountUp value={streak.currentStreak} duration={900} />
              </span>
              <span className="wh-streak__label">
                {t('home.workspace.streakLabel', { count: streak.currentStreak })}
                <small>{t('home.workspace.longest', { count: streak.longestStreak })}</small>
              </span>
            </Link>
          </header>

          <div className="wh-bento">
            <Panel
              className="wh-tile wh-tile--continue"
              title={t('home.workspace.continue')}
              action={{ to: '/scores', label: t('common.nav.items.library') }}
            >
              {!featured ? (
                <p className="wh-empty">{t('home.workspace.noScores')}</p>
              ) : (
                <>
                  <Link
                    to={getScorePath(featured.id, featured.processingStatus)}
                    state={{ from: pathname }}
                    className="wh-feature"
                  >
                    <span className="wh-feature__cover">
                      <AuthImage
                        src={featured.coverUrl ?? featured.thumbnailUrl}
                        alt={featured.title}
                        className="wh-recent__img"
                      />
                    </span>
                    <span className="wh-feature__body">
                      <strong title={featured.title}>{featured.title}</strong>
                      <span>{featured.composer || t('scores.card.unknownComposer')}</span>
                      <small>{t('home.workspace.updated', { when: formatRelative(featured.updatedAt) })}</small>
                    </span>
                  </Link>
                  {others.length > 0 && (
                    <ul className="wh-list">
                      {others.map((s) => (
                        <RecentRow key={s.id} score={s} from={pathname} />
                      ))}
                    </ul>
                  )}
                </>
              )}
            </Panel>

            <section className="wh-tile wh-tile--suggest">
              <span className="wh-tile__kicker">{t('home.workspace.suggestion')}</span>
              {suggestion ? (
                <>
                  <span className="wh-suggest__reason">
                    {suggestion.reason === 'CONTINUE'
                      ? t('home.workspace.suggestContinue')
                      : t('home.workspace.suggestOfficial')}
                  </span>
                  <strong className="wh-suggest__title">{suggestion.score.title}</strong>
                  <span className="wh-meta wh-suggest__meta">
                    <span>{suggestion.score.composer || t('scores.card.unknownComposer')}</span>
                    {suggestion.score.difficulty && <span>{DIFFICULTY_LABELS[suggestion.score.difficulty]}</span>}
                  </span>
                  <Link to={`/scores/${suggestion.score.id}/play`} className="wh-btn wh-btn--light">
                    <Icon name="play" size={16} />
                    {t('home.workspace.practiceNow')}
                  </Link>
                </>
              ) : (
                <p className="wh-suggest__empty">
                  {suggestEmpty[0]}
                  <Link to="/scores/official">{t('common.nav.items.officialLibrary')}</Link>
                  {suggestEmpty[1]}
                </p>
              )}
            </section>

            <Link to={CREATE_SCORE_PATH} className="wh-tile wh-tile--create">
              <Icon name="upload" size={26} />
              <strong>{t('home.workspace.fromImage')}</strong>
              <span>{t('home.workspace.fromImageHint')}</span>
            </Link>
            <Link to="/scores/import" className="wh-tile wh-tile--create">
              <Icon name="music" size={26} />
              <strong>{t('home.workspace.fromFile')}</strong>
              <span>{t('home.workspace.fromFileHint')}</span>
            </Link>
          </div>
        </section>

        {/* màn hai: những việc đang chờ (yêu cầu cần duyệt, việc được giao) và lối tắt */}
        <Showcase title={t('home.workspace.screenTodo')} lead={t('home.workspace.screenTodoLead')}>
          <div className="wh-bento wh-bento--todo">
            <Panel className="wh-tile wh-tile--pending" title={t('home.workspace.pending')}>
              {data.pending.length === 0 ? (
                <p className="wh-empty">{t('home.workspace.noPending')}</p>
              ) : (
                <ul className="wh-list">
                  {data.pending.map((item) => (
                    <li key={`${item.type}-${item.scoreId}-${item.createdAt}`}>
                      <Link to={pendingTarget(item)} state={{ from: pathname }} className="wh-pending">
                        <span className="wh-pending__body">
                          <strong>{pendingText(item)}</strong>
                          <span className="wh-meta">
                            <span>{item.scoreTitle}</span>
                            <span>{formatRelative(item.createdAt)}</span>
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

            {tasks.length > 0 && (
              <Panel
                className="wh-tile wh-tile--tasks"
                title={t('home.workspace.tasks')}
                action={{ to: '/my-tasks', label: t('home.workspace.tasksAll', { count: tasks.length }) }}
              >
                <ul className="wh-list">
                  {tasks.slice(0, MAX_TASKS).map((task) => (
                    <li key={task.itemId}>
                      <Link to={`/teams/${task.teamId}/shows/${task.showId}`} className="wh-task">
                        <span className="wh-task__body">
                          <strong title={task.scoreTitle}>{task.scoreTitle}</strong>
                          <span className="wh-meta">
                            <span>{task.teamName}</span>
                            <span>{task.showName}</span>
                            <span>
                              {[
                                task.asArranger && t('teams.tasks.asArranger'),
                                task.asReviewer && t('teams.tasks.asReviewer'),
                              ]
                                .filter(Boolean)
                                .join(', ')}
                            </span>
                          </span>
                        </span>
                        <span className="wh-task__side">
                          <DueDate date={task.dueDate} now={now} />
                          <StatusBadge status={task.status} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            <nav className="wh-quick" aria-label={t('home.workspace.quickLinks')}>
              {QUICK_LINKS.map((l) => (
                <Link key={l.to} to={l.to} className="wh-quick__item">
                  <span className="wh-quick__icon">
                    <Icon name={l.icon} size={20} />
                  </span>
                  {t(l.labelKey)}
                </Link>
              ))}
            </nav>
          </div>
        </Showcase>

        <Showcase title={t('home.guest.featuresTitle')} lead={t('home.guest.featuresLead')}>
          <div className="wh-showcase scr-stagger">
            {SHOWCASE.map((f) => (
              <Link key={f.key} to={f.to} className="wh-feat">
                <span className="wh-feat__icon" aria-hidden="true">
                  <Icon name={f.icon} size={22} />
                </span>
                <span className="wh-feat__body">
                  <strong>{t(`home.guest.features.${f.key}.title`)}</strong>
                  <span>{t(`home.guest.features.${f.key}.text`)}</span>
                </span>
              </Link>
            ))}
          </div>
        </Showcase>

        <Showcase title={t('home.guest.howTitle')} lead={t('home.guest.howLead')}>
          <ol className="wh-journey scr-stagger">
            {JOURNEY.map((j, i) => (
              <li key={j.key}>
                <Link to={j.to} className="wh-journey__item">
                  <span className="wh-journey__num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <strong>{t(`home.guest.steps.${j.key}.title`)}</strong>
                  <span className="wh-journey__text">{t(`home.guest.steps.${j.key}.text`)}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Showcase>

        <HomeForumBlock
          wrap={(content) => (
            <Showcase title={t('home.forum.title')} lead={t('home.forum.lead')}>
              {content}
            </Showcase>
          )}
        />

        <section className="wh-cta-screen scr" data-screen={t('home.workspace.screenNew')}>
          <div className="wh-cta">
            <div>
              <h2 className="scr-title">{t('home.workspace.ctaTitle')}</h2>
              <p>{t('home.workspace.ctaText')}</p>
            </div>
            <Link to={CREATE_SCORE_PATH} className="wh-btn">
              <Icon name="upload" size={18} />
              {t('home.workspace.ctaButton')}
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter variant="compact" />
    </div>
  );
}
