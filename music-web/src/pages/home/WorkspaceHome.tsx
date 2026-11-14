import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Link } from '../../routes/transition-nav';
import AuthImage from '../../components/scores/common/AuthImage';
import { CREATE_SCORE_PATH } from '../../components/layout/nav';
import { Icon } from '../../components/ui';
import CountUp from '../../components/ui/CountUp';
import NoteField from '../../components/ui/NoteField';
import PianoBackground from '../../components/ui/PianoBackground';
import type { IconName } from '../../components/ui';
import { homeApi } from '../../services';
import type { HomePendingItem, HomeSummary, ScoreSummary } from '../../types';
import { useReveal } from '../../hooks/useReveal';
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

const SHOWCASE: { icon: IconName; key: string; hue: string; to: string }[] = [
  { icon: 'upload', key: 'ocr', hue: 'rose', to: CREATE_SCORE_PATH },
  { icon: 'edit', key: 'editor', hue: 'indigo', to: '/scores' },
  { icon: 'play', key: 'player', hue: 'teal', to: '/scores' },
  { icon: 'flame', key: 'practice', hue: 'amber', to: '/practice-history' },
  { icon: 'users', key: 'teams', hue: 'violet', to: '/teams' },
  { icon: 'share', key: 'export', hue: 'sky', to: '/scores' },
];

const JOURNEY: { icon: IconName; key: 'capture' | 'edit' | 'practice'; to: string }[] = [
  { icon: 'upload', key: 'capture', to: CREATE_SCORE_PATH },
  { icon: 'edit', key: 'edit', to: '/scores' },
  { icon: 'play', key: 'practice', to: '/practice-history' },
];

/** Khối có tiêu đề, hiện dần khi cuộn tới (như landing page). */
function Showcase({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  const ref = useReveal<HTMLElement>();
  return (
    <section ref={ref} className="wh-sec reveal">
      <header className="wh-sec__head">
        <h2>{title}</h2>
        {lead && <p>{lead}</p>}
      </header>
      {children}
    </section>
  );
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Hiệu ứng nam châm: nút nhích nhẹ về phía con trỏ (tối đa 6px), trả về chỗ cũ khi rời. Chỉ cho chuột. */
const magnet = {
  onPointerMove: (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse' || reducedMotion()) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) * 0.18;
    const dy = (e.clientY - (r.top + r.height / 2)) * 0.18;
    el.style.translate = `${Math.max(-6, Math.min(6, dx))}px ${Math.max(-6, Math.min(6, dy))}px`;
  },
  onPointerLeave: (e: PointerEvent<HTMLElement>) => {
    e.currentTarget.style.translate = '';
  },
};

/** Bìa nghiêng 3D theo con trỏ (tối đa 8 độ), trả về phẳng khi rời. */
const tilt = {
  onPointerMove: (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse' || reducedMotion()) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--tilt-x', `${(-y * 16).toFixed(1)}deg`);
    el.style.setProperty('--tilt-y', `${(x * 16).toFixed(1)}deg`);
  },
  onPointerLeave: (e: PointerEvent<HTMLElement>) => {
    e.currentTarget.style.removeProperty('--tilt-x');
    e.currentTarget.style.removeProperty('--tilt-y');
  },
};

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
    <section className={`wh-panel reveal-item ${className}`}>
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
  const rootRef = useRef<HTMLElement>(null);

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

  // Parallax cho vệt sáng trong khung chào (chỉ transform, không động vào chữ), tắt khi giảm chuyển động
  useEffect(() => {
    const root = rootRef.current;
    if (!root || reducedMotion()) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        root.style.setProperty('--wh-par', `${Math.min(window.scrollY, 700)}px`);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
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
    <div className="sc-page wh-page">
      <PianoBackground />
      <main className="sc-container wh" ref={rootRef}>
        <header className="wh-hero">
          <span className="wh-hero__notes" aria-hidden="true">
            <NoteField />
          </span>
          <span className="wh-hero__glow wh-hero__glow--a" aria-hidden="true" />
          <span className="wh-hero__glow wh-hero__glow--b" aria-hidden="true" />
          <span className="wh-hero__glow wh-hero__glow--b" aria-hidden="true" />
          <div className="wh-hero__text">
            <p className="wh-hero__eyebrow">{greeting()},</p>
            <h1>{data.displayName}</h1>
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
                  {...magnet}
                >
                  <Icon name="play" size={18} />
                  {t('home.workspace.continue')}
                </Link>
              ) : (
                <Link to={CREATE_SCORE_PATH} className="wh-btn" {...magnet}>
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
                  {...tilt}
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

          <section className="wh-tile wh-tile--suggest reveal-item">
            <span className="wh-tile__kicker">{t('home.workspace.suggestion')}</span>
            {suggestion ? (
              <>
                <span className="wh-suggest__reason">
                  {suggestion.reason === 'CONTINUE'
                    ? t('home.workspace.suggestContinue')
                    : t('home.workspace.suggestOfficial')}
                </span>
                <strong className="wh-suggest__title">{suggestion.score.title}</strong>
                <span className="wh-suggest__meta">
                  {suggestion.score.composer || t('scores.card.unknownComposer')}
                  {suggestion.score.difficulty && ` · ${DIFFICULTY_LABELS[suggestion.score.difficulty]}`}
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

          <Link to={CREATE_SCORE_PATH} className="wh-tile wh-tile--create wh-tile--rose reveal-item">
            <Icon name="upload" size={26} />
            <strong>{t('home.workspace.fromImage')}</strong>
            <span>{t('home.workspace.fromImageHint')}</span>
          </Link>
          <Link to="/scores/import" className="wh-tile wh-tile--create wh-tile--indigo reveal-item">
            <Icon name="music" size={26} />
            <strong>{t('home.workspace.fromFile')}</strong>
            <span>{t('home.workspace.fromFileHint')}</span>
          </Link>

          <Panel className="wh-tile wh-tile--pending" title={t('home.workspace.pending')}>
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

          <nav className="wh-quick" aria-label={t('home.workspace.quickLinks')}>
            {QUICK_LINKS.map((l, i) => (
              <Link key={l.to} to={l.to} className={`wh-quick__item wh-quick__item--${i} reveal-item`}>
                <span className="wh-quick__icon">
                  <Icon name={l.icon} size={20} />
                </span>
                {t(l.labelKey)}
              </Link>
            ))}
          </nav>
        </div>

        <div className="notef-band" aria-hidden="true">
          <NoteField />
        </div>

        <Showcase title={t('home.guest.featuresTitle')} lead={t('home.guest.featuresLead')}>
          <div className="wh-showcase">
            {SHOWCASE.map((f, i) => (
              <Link
                key={f.key}
                to={f.to}
                className={`wh-feat wh-feat--${f.hue}`}
                style={{ transitionDelay: `${i * 70}ms` }}
              >
                <span className="wh-feat__icon">
                  <Icon name={f.icon} size={22} />
                </span>
                <strong>{t(`home.guest.features.${f.key}.title`)}</strong>
                <span>{t(`home.guest.features.${f.key}.text`)}</span>
                <Icon name="chevronRight" size={18} />
              </Link>
            ))}
          </div>
        </Showcase>

        <Showcase title={t('home.guest.howTitle')} lead={t('home.guest.howLead')}>
          <ol className="wh-journey">
            {JOURNEY.map((j, i) => (
              <li key={j.key} style={{ transitionDelay: `${i * 140}ms` }}>
                <Link to={j.to} className="wh-journey__item">
                  <span className="wh-journey__no">{i + 1}</span>
                  <span className="wh-journey__icon">
                    <Icon name={j.icon} size={22} />
                  </span>
                  <strong>{t(`home.guest.steps.${j.key}.title`)}</strong>
                  <span>{t(`home.guest.steps.${j.key}.text`)}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Showcase>

        <section className="wh-cta reveal-item">
          <div>
            <h2>{t('home.workspace.ctaTitle')}</h2>
            <p>{t('home.workspace.ctaText')}</p>
          </div>
          <Link to={CREATE_SCORE_PATH} className="wh-btn">
            <Icon name="upload" size={18} />
            {t('home.workspace.ctaButton')}
          </Link>
        </section>
      </main>
    </div>
  );
}
