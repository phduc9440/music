import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { Link } from '../../routes/transition-nav';
import { useNavigate } from '../../routes/useTransitionNavigate';
import { CREATE_SCORE_PATH } from '../../components/layout/nav';
import SiteFooter from '../../components/layout/SiteFooter';
import ComposerPortrait from '../../components/composers/ComposerPortrait';
import { Icon } from '../../components/ui';
import CountUp from '../../components/ui/CountUp';
import { API_BASE_URL, homeApi } from '../../services';
import ThemeToggle from '../../theme/ThemeToggle';
import type { Composer, PublicHome, ScoreSummary } from '../../types';
import HomeForumBlock from '../../components/home/HomeForumBlock';
import ScoreConstellation from '../../components/home/ScoreConstellation';
import { useTilt3D } from '../../components/home/useTilt3D';
import { lifespan } from '../../utils/composer';
import { DIFFICULTY_LABELS } from '../../utils/score';
import { formatNumber, t } from '../../i18n/core';
import LanguageToggle from '../../i18n/LanguageToggle';
import { isImportBatch, setPendingUpload } from '../../utils/pendingUpload';
import './guest-home.css';

// Vòng khuông Für Elise 3D (three.js) tải riêng, sau khi trang đã hiện: không làm nặng gói chính
const FurEliseRing3D = lazy(() => import('../../components/home/FurEliseRing3D'));

const TILT_CARDS = '.gh-score, .gh-composer, .gh-steps li, .gh-features > div';

const STEPS = ['capture', 'edit', 'practice'] as const;
const FEATURES = ['ocr', 'editor', 'player', 'practice', 'teams', 'export'] as const;
const FAQ_KEYS = ['prepare', 'privacy', 'price', 'mobile'] as const;

/** Một khối của trang: tiêu đề và lời dẫn bên trái, phần nội dung theo bố cục của từng khối. */
function Section({
  id,
  title,
  lead,
  variant,
  children,
}: {
  id?: string;
  title: string;
  lead?: string;
  variant?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`gh-section${variant ? ` gh-section--${variant}` : ''}`}>
      <header className="gh-section__head">
        <h2>{title}</h2>
        {lead && <p>{lead}</p>}
      </header>
      <div className="gh-section__body">{children}</div>
    </section>
  );
}

const DEMO_NOTES = [96, 84, 72, 84, 60, 72, 84, 96, 72, 60, 72, 84];
const DEMO_SECONDS = 8;

/**
 * Mô phỏng trình xem bản nhạc: đầu phát quét qua khuông, nốt sáng lên khi đầu phát đi tới. Có nút Phát/Tạm dừng, tạm
 * dừng khi ra khỏi màn hình, không tự chạy khi bật "Giảm chuyển động".
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
      <p className="gh-demo__title">Für Elise</p>
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
        <button type="button" className="gh-ghost" aria-pressed={playing} onClick={() => setPlaying((p) => !p)}>
          <Icon name={playing ? 'x' : 'play'} size={16} />
          {playing ? t('home.guest.demoPause') : t('home.guest.demoPlay')}
        </button>
        <span className="gh-demo__fact">♩ = 96</span>
        <span className="gh-demo__fact">{t('home.guest.demoScore')}</span>
      </div>
      <figcaption>{t('home.guest.demoCaption')}</figcaption>
    </figure>
  );
}

/** Ảnh công khai (/api/public/...) tải thẳng bằng <img>, không cần token như ảnh trong thư viện. */
const publicUrl = (path: string) => `${API_BASE_URL.replace(/\/api\/?$/, '')}${path}`;

/**
 * Bìa: ảnh trang 1 nếu có, nếu không (hoặc tải lỗi) thì dựng một trang nhạc có năm dòng kẻ khuông và tên bài, để bìa
 * không bị trống trơn.
 */
function FeaturedCover({ score }: { score: ScoreSummary }) {
  const [broken, setBroken] = useState(false);
  const image = score.coverUrl ?? (score.thumbnailUrl ? publicUrl(score.thumbnailUrl) : null);
  if (image && !broken) {
    return <img src={image} alt="" className="gh-score__img" loading="lazy" onError={() => setBroken(true)} />;
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
      className="gh-score"
      onClick={onOpen}
      aria-label={t('home.guest.openScore', { title: score.title })}
    >
      <span className="gh-score__cover">
        <FeaturedCover score={score} />
      </span>
      <span className="gh-score__rank">{rank}</span>
      <strong className="gh-score__title" title={score.title}>
        {score.title}
      </strong>
      <span className="gh-score__composer">{score.composer || t('scores.card.unknownComposer')}</span>
      <span className="gh-score__meta">
        {score.difficulty && <span>{DIFFICULTY_LABELS[score.difficulty]}</span>}
        <span title={t('scores.card.viewsTitle')}>
          <Icon name="eye" size={14} />
          {formatNumber(score.viewCount ?? 0)}
        </span>
        {score.ratingAverage != null && (
          <span title={t('scores.card.ratingTitle')}>
            <Icon name="star" size={14} />
            {score.ratingAverage.toFixed(1)}
          </span>
        )}
      </span>
    </button>
  );
}

/** Dải bìa cuộn ngang; nhiều bìa thì hiện nút trái/phải. */
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
      <div ref={ref} className="gh-strip">
        {children}
      </div>
      {!(edges.start && edges.end) && (
        <div className="gh-strip__nav">
          <button
            type="button"
            className="gh-round"
            aria-label={t('home.guest.prev')}
            disabled={edges.start}
            onClick={() => scrollBy(-1)}
          >
            <Icon name="chevronLeft" size={20} />
          </button>
          <button
            type="button"
            className="gh-round"
            aria-label={t('home.guest.next')}
            disabled={edges.end}
            onClick={() => scrollBy(1)}
          >
            <Icon name="chevronRight" size={20} />
          </button>
        </div>
      )}
    </div>
  );
}

/** Nhạc sĩ: chân dung lớn, tên ở cỡ tiêu đề; năm sinh mất và các bản tiêu biểu nằm ngay dưới, không cần lật thẻ. */
function ComposerCard({ composer }: { composer: Composer }) {
  const titles = composer.topTitles ?? [];
  const life = lifespan(composer);
  return (
    <Link
      to={`/composers/${composer.slug}`}
      className="gh-composer"
      aria-label={t('home.guest.composerLabel', { name: composer.name, count: composer.scoreCount })}
    >
      <span className="gh-composer__portrait">
        <ComposerPortrait name={composer.name} imageUrl={composer.imageUrl} />
      </span>
      <strong className="gh-composer__name">{composer.name}</strong>
      <span className="gh-composer__meta">
        {life && <span>{life}</span>}
        <span>{t('home.guest.composerOnSystem', { count: composer.scoreCount })}</span>
      </span>
      {titles.length > 0 && (
        <ul className="gh-composer__titles">
          {titles.map((title) => (
            <li key={title}>{title}</li>
          ))}
        </ul>
      )}
    </Link>
  );
}

/** Trang chủ cho khách chưa đăng nhập (mục 5.3). Người đã đăng nhập thấy trang làm việc ở cùng đường dẫn /. */
export default function GuestHome() {
  const navigate = useNavigate();
  const [data, setData] = useState<PublicHome | null>(null);
  const [failed, setFailed] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Hình chòm sao ở hero chạy liên tục: có nút dừng nhìn thấy được
  const [still, setStill] = useState(false);

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

  const pageRef = useRef<HTMLDivElement>(null);
  useTilt3D(pageRef, TILT_CARDS);

  return (
    <div ref={pageRef} className="gh">
      <Suspense fallback={null}>
        <FurEliseRing3D />
      </Suspense>
      <header className="gh-bar">
        <div className="gh-bar__inner">
          <span className="gh-brand">
            <span className="gh-brand__mark" aria-hidden="true">
              <Icon name="music" size={16} />
            </span>
            Music App
          </span>
          <div className="gh-bar__actions">
            <LanguageToggle />
            <ThemeToggle />
            <button ref={signInRef} type="button" className="gh-ghost" onClick={() => navigate('/auth/login')}>
              {t('home.guest.signIn')}
            </button>
            <button
              type="button"
              className="gh-cta gh-bar__signup"
              onClick={() => navigate('/auth/login', { state: { mode: 'register' } })}
            >
              {t('home.guest.signUp')}
            </button>
          </div>
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
        <div className="gh-hero__text">
          <h1>{t('home.guest.heroTitle')}</h1>
          <p className="gh-hero__lead">{t('home.guest.heroLead')}</p>
          <div className="gh-hero__actions">
            <button type="button" className="gh-cta" onClick={() => loginThen(CREATE_SCORE_PATH)}>
              <Icon name="upload" size={18} />
              {t('home.guest.ctaDigitize')}
            </button>
            <a className="gh-ghost" href="#featured">
              {t('home.guest.ctaExplore')}
            </a>
          </div>
          <p className="gh-hero__hint" aria-live="polite">
            {dragging ? t('home.guest.dropNow') : t('home.guest.dropHint')}
          </p>
        </div>
        <figure className="gh-hero__visual">
          <ScoreConstellation paused={still} label={t('home.guest.demoCaption')} />
          <button
            type="button"
            className="gh-ghost gh-hero__pause"
            aria-pressed={!still}
            onClick={() => setStill((s) => !s)}
          >
            <Icon name={still ? 'play' : 'x'} size={14} />
            {still ? t('home.guest.demoPlay') : t('home.guest.demoPause')}
          </button>
        </figure>
      </section>

      <main className="gh-main">
        {failed && <p className="gh-note">{t('home.guest.loadFailed')}</p>}

        <Section title={t('home.guest.demoTitle')} lead={t('home.guest.demoLead')} variant="demo">
          <ScoreDemo />
        </Section>

        <Section id="featured" title={t('home.guest.featuredTitle')} lead={t('home.guest.featuredLead')} variant="wide">
          {!data && !failed && (
            <div className="gh-strip" aria-hidden="true">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="gh-score gh-score--skeleton" />
              ))}
            </div>
          )}
          {data && data.featured.length === 0 && <p className="gh-note">{t('home.guest.featuredEmpty')}</p>}
          {data && data.featured.length > 0 && (
            <FeaturedStrip>
              {data.featured.map((s, i) => (
                <FeaturedCard key={s.id} score={s} rank={i + 1} onOpen={() => navigate(`/s/${s.id}`)} />
              ))}
            </FeaturedStrip>
          )}
        </Section>

        <Section title={t('home.guest.howTitle')} lead={t('home.guest.howLead')} variant="steps">
          <ol className="gh-steps">
            {STEPS.map((key) => (
              <li key={key}>
                <strong>{t(`home.guest.steps.${key}.title`)}</strong>
                <p>{t(`home.guest.steps.${key}.text`)}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section title={t('home.guest.featuresTitle')} lead={t('home.guest.featuresLead')} variant="wide">
          <dl className="gh-features">
            {FEATURES.map((key) => (
              <div key={key}>
                <dt>{t(`home.guest.features.${key}.title`)}</dt>
                <dd>{t(`home.guest.features.${key}.text`)}</dd>
              </div>
            ))}
          </dl>
        </Section>

        {stats && (
          <Section title={t('home.guest.statsTitle')} lead={t('home.guest.statsLead')} variant="stats">
            <dl className="gh-stats">
              <div>
                <dd>
                  <CountUp value={stats.scores} />
                </dd>
                <dt>{t('home.guest.statScores')}</dt>
              </div>
              <div>
                <dd>
                  <CountUp value={stats.digitizedPages} />
                </dd>
                <dt>{t('home.guest.statPages')}</dt>
              </div>
              <div>
                <dd>
                  <CountUp value={stats.practiceHours} />
                </dd>
                <dt>{t('home.guest.statHours')}</dt>
              </div>
              <div>
                <dd>
                  <CountUp value={stats.members} />
                </dd>
                <dt>{t('home.guest.statMembers')}</dt>
              </div>
            </dl>
          </Section>
        )}

        {data && data.composers.length > 0 && (
          <Section title={t('home.guest.composersTitle')} lead={t('home.guest.composersLead')} variant="wide">
            <div className="gh-composers">
              {data.composers.map((c) => (
                <ComposerCard key={c.id} composer={c} />
              ))}
            </div>
          </Section>
        )}

        <HomeForumBlock
          wrap={(content) => (
            <Section title={t('home.forum.title')} lead={t('home.forum.lead')} variant="flip">
              {content}
            </Section>
          )}
        />

        <Section id="faq" title={t('home.guest.faqTitle')}>
          <div className="gh-faq">
            {FAQ_KEYS.map((key) => (
              <details key={key}>
                <summary>
                  {t(`home.guest.faq.${key}.q`)}
                  <Icon name="plus" size={18} />
                </summary>
                <p>{t(`home.guest.faq.${key}.a`)}</p>
              </details>
            ))}
          </div>
        </Section>

        <section className="gh-final">
          <div className="gh-final__card">
            <h2>{t('home.guest.finalTitle')}</h2>
            <button type="button" className="gh-cta" onClick={() => loginThen(CREATE_SCORE_PATH)}>
              {t('home.guest.finalCta')}
            </button>
          </div>
        </section>
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
