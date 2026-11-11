import { useEffect, useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { Link } from '../../routes/transition-nav';
import { useNavigate } from '../../routes/useTransitionNavigate';
import { CREATE_SCORE_PATH } from '../../components/layout/nav';
import SiteFooter from '../../components/layout/SiteFooter';
import ComposerPortrait from '../../components/composers/ComposerPortrait';
import { Icon } from '../../components/ui';
import type { IconName } from '../../components/ui';
import { API_BASE_URL, homeApi } from '../../services';
import ThemeToggle from '../../theme/ThemeToggle';
import type { Composer, PublicHome, ScoreSummary } from '../../types';
import { useReveal } from '../../hooks/useReveal';
import { lifespan } from '../../utils/composer';
import { DIFFICULTY_LABELS } from '../../utils/score';
import { formatNumber, t } from '../../i18n/core';
import LanguageToggle from '../../i18n/LanguageToggle';
import { isImportBatch, setPendingUpload } from '../../utils/pendingUpload';
import './guest-home.css';

const STEPS: { icon: IconName; key: 'capture' | 'edit' | 'practice' }[] = [
  { icon: 'upload', key: 'capture' },
  { icon: 'edit', key: 'edit' },
  { icon: 'play', key: 'practice' },
];

const FAQ_KEYS = ['prepare', 'privacy', 'price', 'mobile'] as const;

/** Khối có tiêu đề, hiện dần khi cuộn tới. */
function Section({ id, title, lead, children }: { id?: string; title: string; lead?: string; children: ReactNode }) {
  const ref = useReveal<HTMLElement>();
  return (
    <section id={id} ref={ref} className="gh-section reveal">
      <header className="gh-section__head">
        <span className="gh-staff-rule" aria-hidden="true" />
        <h2>{title}</h2>
        {lead && <p>{lead}</p>}
      </header>
      {children}
    </section>
  );
}

/** Năm dòng kẻ khuông chạy ngang và vài nốt nhạc trôi chậm (trang trí, ẩn với trình đọc màn hình). */
function StaffBackdrop() {
  return (
    <svg className="gh-hero__staff" viewBox="0 0 1200 160" preserveAspectRatio="none" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={i} x1="0" x2="1200" y1={30 + i * 25} y2={30 + i * 25} />
      ))}
      <g className="gh-hero__notes">
        <g transform="translate(180 92)">
          <ellipse rx="11" ry="8" transform="rotate(-20)" />
          <rect x="9" y="-62" width="2.5" height="62" />
        </g>
        <g transform="translate(420 67)">
          <ellipse rx="11" ry="8" transform="rotate(-20)" />
          <rect x="9" y="-62" width="2.5" height="62" />
        </g>
        <g transform="translate(700 117)">
          <ellipse rx="11" ry="8" transform="rotate(-20)" />
          <rect x="9" y="-62" width="2.5" height="62" />
        </g>
        <g transform="translate(960 80)">
          <ellipse rx="11" ry="8" transform="rotate(-20)" />
          <rect x="9" y="-62" width="2.5" height="62" />
        </g>
      </g>
    </svg>
  );
}

/** Ảnh công khai (/api/public/...) tải thẳng bằng <img>, không cần token như ảnh trong thư viện. */
const publicUrl = (path: string) => `${API_BASE_URL.replace(/\/api\/?$/, '')}${path}`;

/**
 * Bìa thẻ: ảnh trang 1 nếu có, nếu không (hoặc tải lỗi) thì vẽ một trang nhạc trống có năm dòng kẻ khuông và tên bài,
 * để thẻ không bị trống trơn.
 */
function FeaturedCover({ score }: { score: ScoreSummary }) {
  const [broken, setBroken] = useState(false);
  if (score.thumbnailUrl && !broken) {
    return (
      <img
        src={publicUrl(score.thumbnailUrl)}
        alt=""
        className="gh-card__img"
        loading="lazy"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span className="gh-sheet" aria-hidden="true">
      <span className="gh-sheet__title">{score.title}</span>
      {score.composer && <span className="gh-sheet__composer">{score.composer}</span>}
      <span className="gh-sheet__staves">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="gh-sheet__staff" />
        ))}
      </span>
    </span>
  );
}

function FeaturedCard({ score, rank, onOpen }: { score: ScoreSummary; rank: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="gh-card"
      onClick={onOpen}
      aria-label={t('home.guest.openScore', { title: score.title })}
    >
      <span className="gh-card__cover">
        <FeaturedCover score={score} />
        <span className="gh-card__rank">#{rank}</span>
        <span className="gh-card__open">
          {t('home.guest.open')}
          <Icon name="chevronRight" size={14} />
        </span>
      </span>
      <span className="gh-card__body">
        <strong className="gh-card__title" title={score.title}>
          {score.title}
        </strong>
        <span className="gh-card__composer">{score.composer || t('scores.card.unknownComposer')}</span>
        <span className="gh-card__meta">
          {score.difficulty && <span className="gh-chip">{DIFFICULTY_LABELS[score.difficulty]}</span>}
          <span className="gh-card__stat" title={t('scores.card.viewsTitle')}>
            <Icon name="eye" size={14} />
            {formatNumber(score.viewCount ?? 0)}
          </span>
          {score.ratingAverage != null && (
            <span className="gh-card__stat" title={t('scores.card.ratingTitle')}>
              <Icon name="star" size={14} />
              {score.ratingAverage.toFixed(1)}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

/** Dải thẻ cuộn ngang; ít thẻ thì căn giữa, nhiều thẻ thì hiện nút trái/phải. */
function FeaturedStrip({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setEdges({
        start: el.scrollLeft <= 4,
        end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4,
      });
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [children]);

  const scrollBy = (dir: 1 | -1) =>
    ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' });

  return (
    <div className="gh-strip-wrap">
      {!edges.start && (
        <button
          type="button"
          className="gh-strip__nav gh-strip__nav--prev"
          aria-label={t('home.guest.prev')}
          onClick={() => scrollBy(-1)}
        >
          <Icon name="chevronLeft" size={20} />
        </button>
      )}
      <div ref={ref} className="gh-strip">
        {children}
      </div>
      {!edges.end && (
        <button
          type="button"
          className="gh-strip__nav gh-strip__nav--next"
          aria-label={t('home.guest.next')}
          onClick={() => scrollBy(1)}
        >
          <Icon name="chevronRight" size={20} />
        </button>
      )}
    </div>
  );
}

function ComposerCard({ composer }: { composer: Composer }) {
  const titles = composer.topTitles ?? [];
  return (
    // Thẻ lật: mặt trước chân dung và tên, rê chuột hoặc chọn bằng bàn phím thì lật ra năm sinh–mất và các bản tiêu biểu
    <Link
      to={`/composers/${composer.slug}`}
      className="gh-composer"
      aria-label={t('home.guest.composerLabel', { name: composer.name, count: composer.scoreCount })}
    >
      <div className="gh-composer__inner">
        <div className="gh-composer__face gh-composer__face--front">
          <span className="gh-composer__portrait">
            <ComposerPortrait name={composer.name} imageUrl={composer.imageUrl} />
          </span>
          <strong>{composer.name}</strong>
          <span>{t('composers.scoreCount', { count: composer.scoreCount })}</span>
        </div>
        <div className="gh-composer__face gh-composer__face--back">
          <strong>{composer.name}</strong>
          {lifespan(composer) && <span>{lifespan(composer)}</span>}
          {titles.length > 0 && (
            <ul>
              {titles.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
          <span>{t('home.guest.composerOnSystem', { count: composer.scoreCount })}</span>
        </div>
      </div>
    </Link>
  );
}

/** Trang chủ cho khách chưa đăng nhập (mục 5.3). Người đã đăng nhập thấy trang làm việc ở cùng đường dẫn /. */
export default function GuestHome() {
  const navigate = useNavigate();
  const [data, setData] = useState<PublicHome | null>(null);
  const [failed, setFailed] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let cancelled = false;
    homeApi
      .publicHome()
      .then((res) => !cancelled && setData(res.data.result))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  /** Đăng nhập rồi quay lại đúng trang định vào. */
  const loginThen = (from: string) => navigate('/auth/login', { state: { from } });

  // Thả file vào hero: giữ file lại, đăng nhập, rồi về đúng luồng tải lên (MusicXML/MIDI thì nhập, còn lại số hóa)
  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    setPendingUpload(files);
    loginThen(isImportBatch(files) ? '/scores/import' : CREATE_SCORE_PATH);
  };

  const stats = data?.stats;

  return (
    <div className="gh">
      <header className="gh-bar">
        <span className="gh-brand">
          <span className="gh-brand__logo">
            <Icon name="music" size={16} />
          </span>
          Music App
        </span>
        <div className="gh-bar__actions">
          <LanguageToggle />
          <ThemeToggle />
          <button type="button" className="gh-btn gh-btn--ghost" onClick={() => navigate('/auth/login')}>
            {t('home.guest.signIn')}
          </button>
        </div>
      </header>

      <section
        className={`gh-hero${dragging ? ' gh-hero--drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={onDrop}
      >
        <StaffBackdrop />
        <div className="gh-hero__content">
          <p className="gh-hero__eyebrow">{t('home.guest.eyebrow')}</p>
          <h1>{t('home.guest.heroTitle')}</h1>
          <p className="gh-hero__lead">{t('home.guest.heroLead')}</p>
          <div className="gh-hero__cta">
            <button type="button" className="gh-btn gh-btn--velvet" onClick={() => loginThen(CREATE_SCORE_PATH)}>
              <Icon name="upload" size={18} />
              {t('home.guest.ctaDigitize')}
            </button>
            <a className="gh-btn gh-btn--brass" href="#featured">
              {t('home.guest.ctaExplore')}
            </a>
          </div>
          <p className="gh-hero__hint">{dragging ? t('home.guest.dropNow') : t('home.guest.dropHint')}</p>
        </div>
      </section>

      <main className="gh-main">
        {failed && <p className="gh-note">{t('home.guest.loadFailed')}</p>}

        <Section id="featured" title={t('home.guest.featuredTitle')} lead={t('home.guest.featuredLead')}>
          {!data && !failed && (
            <div className="gh-strip">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="gh-card gh-card--skeleton" aria-hidden="true" />
              ))}
            </div>
          )}
          {data && data.featured.length === 0 && <p className="gh-note">{t('home.guest.featuredEmpty')}</p>}
          {data && data.featured.length > 0 && (
            <FeaturedStrip>
              {data.featured.map((s, i) => (
                <FeaturedCard key={s.id} score={s} rank={i + 1} onOpen={() => loginThen(`/scores/${s.id}`)} />
              ))}
            </FeaturedStrip>
          )}
        </Section>

        {data && data.composers.length > 0 && (
          <Section title={t('home.guest.composersTitle')} lead={t('home.guest.composersLead')}>
            <div className="gh-composers">
              {data.composers.map((c) => (
                <ComposerCard key={c.id} composer={c} />
              ))}
            </div>
          </Section>
        )}

        <Section title={t('home.guest.howTitle')} lead={t('home.guest.howLead')}>
          <ol className="gh-steps">
            {STEPS.map((s, i) => (
              <li key={s.key} className="gh-step" style={{ transitionDelay: `${i * 120}ms` }}>
                <span className="gh-step__icon">
                  <Icon name={s.icon} size={22} />
                </span>
                <span className="gh-step__no">{t('home.guest.step', { n: i + 1 })}</span>
                <strong>{t(`home.guest.steps.${s.key}.title`)}</strong>
                <p>{t(`home.guest.steps.${s.key}.text`)}</p>
              </li>
            ))}
          </ol>
        </Section>

        {stats && (
          <Section title={t('home.guest.statsTitle')} lead={t('home.guest.statsLead')}>
            <dl className="gh-stats">
              <div>
                <dt>{t('home.guest.statScores')}</dt>
                <dd>{formatNumber(stats.scores)}</dd>
              </div>
              <div>
                <dt>{t('home.guest.statPages')}</dt>
                <dd>{formatNumber(stats.digitizedPages)}</dd>
              </div>
              <div>
                <dt>{t('home.guest.statHours')}</dt>
                <dd>{formatNumber(stats.practiceHours)}</dd>
              </div>
              <div>
                <dt>{t('home.guest.statMembers')}</dt>
                <dd>{formatNumber(stats.members)}</dd>
              </div>
            </dl>
          </Section>
        )}

        <Section id="faq" title={t('home.guest.faqTitle')}>
          <div className="gh-faq">
            {FAQ_KEYS.map((key) => (
              <details key={key}>
                <summary>{t(`home.guest.faq.${key}.q`)}</summary>
                <p>{t(`home.guest.faq.${key}.a`)}</p>
              </details>
            ))}
          </div>
          <div className="gh-final">
            <p>{t('home.guest.finalTitle')}</p>
            <button type="button" className="gh-btn gh-btn--velvet" onClick={() => loginThen(CREATE_SCORE_PATH)}>
              {t('home.guest.finalCta')}
            </button>
          </div>
        </Section>
      </main>

      <SiteFooter />
    </div>
  );
}
