import { useEffect, useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { Link } from '../../routes/transition-nav';
import { useNavigate } from '../../routes/useTransitionNavigate';
import { CREATE_SCORE_PATH } from '../../components/layout/nav';
import SiteFooter from '../../components/layout/SiteFooter';
import ComposerPortrait from '../../components/composers/ComposerPortrait';
import { Icon } from '../../components/ui';
import CountUp from '../../components/ui/CountUp';
import NoteField from '../../components/ui/NoteField';
import PianoBackdrop from '../../components/ui/PianoBackdrop';
import PianoBackground from '../../components/ui/PianoBackground';
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

const FEATURES: { icon: IconName; key: string; hue: string; wide?: boolean }[] = [
  { icon: 'upload', key: 'ocr', hue: 'rose', wide: true },
  { icon: 'edit', key: 'editor', hue: 'indigo' },
  { icon: 'play', key: 'player', hue: 'teal' },
  { icon: 'flame', key: 'practice', hue: 'amber', wide: true },
  { icon: 'users', key: 'teams', hue: 'violet' },
  { icon: 'share', key: 'export', hue: 'sky' },
];

const TERMS = [
  'Allegro',
  'Adagio',
  'Crescendo',
  'Legato',
  'Staccato',
  'Fortissimo',
  'Andante',
  'Vivace',
  'Cantabile',
  'Dolce',
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

const DEMO_NOTES = [96, 84, 72, 84, 60, 72, 84, 96, 72, 60, 72, 84];
const DEMO_SECONDS = 8;

/**
 * Mô phỏng trình xem bản nhạc: đầu phát quét qua khuông, nốt sáng lên khi đầu phát đi tới (skill: Product Demo, có nút
 * Phát/Tạm dừng nhìn thấy được, tạm dừng khi ra khỏi màn hình, không tự chạy khi bật "Giảm chuyển động").
 */
function ScoreDemo() {
  const ref = useRef<HTMLElement>(null);
  const [playing, setPlaying] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const running = playing && inView;
  return (
    <figure ref={ref} className={`gh-demo${running ? '' : ' is-paused'}`}>
      <div className="gh-demo__window">
        <div className="gh-demo__bar" aria-hidden="true">
          <i />
          <i />
          <i />
          <span>Für Elise</span>
        </div>
        <svg className="gh-demo__score" viewBox="0 0 600 170" role="img" aria-label={t('home.guest.demoCaption')}>
          {[0, 1, 2, 3, 4].map((i) => (
            <line key={i} x1="20" x2="580" y1={40 + i * 20} y2={40 + i * 20} />
          ))}
          {DEMO_NOTES.map((y, i) => {
            const x = 40 + ((i + 0.5) / DEMO_NOTES.length) * 520;
            const at = ((i + 0.5) / DEMO_NOTES.length) * DEMO_SECONDS - 0.15;
            return (
              <g key={i} className="gh-demo__note" style={{ animationDelay: `${at.toFixed(2)}s` }}>
                <ellipse cx={x} cy={y + 24} rx="10" ry="7.5" transform={`rotate(-20 ${x} ${y + 24})`} />
                <rect x={x + 8} y={y - 12} width="2.4" height="36" />
              </g>
            );
          })}
          <rect className="gh-demo__head" x="40" y="24" width="3" height="112" rx="1.5" />
        </svg>
        <div className="gh-demo__foot">
          <button type="button" className="gh-demo__btn" aria-pressed={playing} onClick={() => setPlaying((p) => !p)}>
            <Icon name={playing ? 'x' : 'play'} size={16} />
            {playing ? t('home.guest.demoPause') : t('home.guest.demoPlay')}
          </button>
          <span className="gh-demo__chip">♩ = 96</span>
          <span className="gh-demo__meter" aria-hidden="true">
            <i />
          </span>
          <span className="gh-demo__chip gh-demo__chip--ok">{t('home.guest.demoScore')}</span>
        </div>
      </div>
      <figcaption>{t('home.guest.demoCaption')}</figcaption>
    </figure>
  );
}

/** Băng chạy ngang các thuật ngữ âm nhạc. */
function TermsMarquee() {
  const row = [...TERMS, ...TERMS];
  return (
    <div className="gh-marquee" aria-hidden="true">
      <div className="gh-marquee__track">
        {row.concat(row).map((w, i) => (
          <span key={i}>
            <Icon name="music" size={14} />
            {w}
          </span>
        ))}
      </div>
    </div>
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
  const image = score.coverUrl ?? (score.thumbnailUrl ? publicUrl(score.thumbnailUrl) : null);
  if (image && !broken) {
    return <img src={image} alt="" className="gh-card__img" loading="lazy" onError={() => setBroken(true)} />;
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
  const rootRef = useRef<HTMLDivElement>(null);
  const signInRef = useRef<HTMLButtonElement>(null);
  // Nút Đăng nhập trên thanh đầu trang đã cuộn khuất: hiện nút Đăng nhập dính ở góc dưới phải
  const [past, setPast] = useState(false);

  useEffect(() => {
    const el = signInRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setPast(!e.isIntersecting && e.boundingClientRect.bottom <= 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Thanh tiến độ cuộn và parallax nhiều lớp cho phần trang trí (không động vào chữ)
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      root.style.setProperty('--gh-progress', String(max > 0 ? Math.min(1, y / max) : 0));
      if (!reduce) root.style.setProperty('--gh-par', `${Math.min(y, 900)}px`);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="gh" ref={rootRef}>
      <PianoBackground />
      <div className="gh-progress" aria-hidden="true" />
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
          <button
            ref={signInRef}
            type="button"
            className="gh-btn gh-btn--ghost"
            onClick={() => navigate('/auth/login')}
          >
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
        <span className="gh-hero__glow gh-hero__glow--a" aria-hidden="true" />
        <span className="gh-hero__glow gh-hero__glow--b" aria-hidden="true" />
        <span className="gh-hero__notefield" aria-hidden="true">
          <NoteField />
        </span>
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
        <PianoBackdrop />
      </section>
      <TermsMarquee />

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

        <Section title={t('home.guest.demoTitle')} lead={t('home.guest.demoLead')}>
          <ScoreDemo />
        </Section>

        <div className="notef-band" aria-hidden="true">
          <NoteField />
        </div>

        <Section title={t('home.guest.featuresTitle')} lead={t('home.guest.featuresLead')}>
          <div className="gh-bento">
            {FEATURES.map((f, i) => (
              <article
                key={f.key}
                className={`gh-tile gh-tile--${f.hue}${f.wide ? ' gh-tile--wide' : ''}`}
                style={{ transitionDelay: `${i * 70}ms` }}
              >
                <span className="gh-tile__icon">
                  <Icon name={f.icon} size={22} />
                </span>
                <h3>{t(`home.guest.features.${f.key}.title`)}</h3>
                <p>{t(`home.guest.features.${f.key}.text`)}</p>
              </article>
            ))}
          </div>
        </Section>

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
                <dd>
                  <CountUp value={stats.scores} />
                </dd>
              </div>
              <div>
                <dt>{t('home.guest.statPages')}</dt>
                <dd>
                  <CountUp value={stats.digitizedPages} />
                </dd>
              </div>
              <div>
                <dt>{t('home.guest.statHours')}</dt>
                <dd>
                  <CountUp value={stats.practiceHours} />
                </dd>
              </div>
              <div>
                <dt>{t('home.guest.statMembers')}</dt>
                <dd>
                  <CountUp value={stats.members} />
                </dd>
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

      <button
        type="button"
        className={`gh-sticky${past ? ' is-on' : ''}`}
        tabIndex={past ? 0 : -1}
        aria-hidden={!past}
        onClick={() => navigate('/auth/login')}
      >
        <Icon name="user" size={16} />
        {t('home.guest.signIn')}
      </button>

      <SiteFooter />
    </div>
  );
}
