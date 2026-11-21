import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { Link } from '../../routes/transition-nav';
import { useNavigate } from '../../routes/useTransitionNavigate';
import { CREATE_SCORE_PATH } from '../../components/layout/nav';
import SiteFooter from '../../components/layout/SiteFooter';
import ComposerPortrait from '../../components/composers/ComposerPortrait';
import { Icon } from '../../components/ui';
import type { IconName } from '../../components/ui';
import CountUp from '../../components/ui/CountUp';
import { API_BASE_URL, homeApi } from '../../services';
import ThemeToggle from '../../theme/ThemeToggle';
import type { Composer, PublicHome, ScoreSummary } from '../../types';
import HomeForumBlock from '../../components/home/HomeForumBlock';
import SectionDots from '../../components/home/SectionDots';
import { useScreenSnap } from '../../components/home/useScreenSnap';
import ScoreConstellation from '../../components/home/ScoreConstellation';
import { useTilt3D } from '../../components/home/useTilt3D';
import { lifespan } from '../../utils/composer';
import { DIFFICULTY_LABELS } from '../../utils/score';
import { formatNumber, t } from '../../i18n/core';
import LanguageToggle from '../../i18n/LanguageToggle';
import { isImportBatch, setPendingUpload } from '../../utils/pendingUpload';
import './guest-home.css';

// Vòng khuông hộp nhạc 3D (three.js) tải riêng, sau khi trang đã hiện: không làm nặng gói chính
const MusicBoxRing3D = lazy(() => import('../../components/home/MusicBoxRing3D'));

const TILT_CARDS = '.gh-score, .gh-composer';

const STEPS = ['capture', 'edit', 'practice'] as const;
/** Tính năng và biểu tượng đi kèm. */
const FEATURES: [string, IconName][] = [
  ['ocr', 'upload'],
  ['editor', 'pencil'],
  ['player', 'play'],
  ['practice', 'activity'],
  ['teams', 'users'],
  ['export', 'share'],
];
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
    <section id={id} data-screen={title} className={`gh-section scr${variant ? ` gh-section--${variant}` : ''}`}>
      <header className="gh-section__head">
        <h2 className="scr-title">{title}</h2>
        {lead && <p>{lead}</p>}
      </header>
      <div className="gh-section__body">{children}</div>
    </section>
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
      <div ref={ref} className="gh-strip scr-stagger">
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
  // Hình chòm sao nốt nhạc chạy liên tục: có nút dừng nhìn thấy được
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

  // mỗi màn một section, hít vào ngay dưới thanh đầu trang (cao 80px)
  useScreenSnap('80px');

  return (
    <div ref={pageRef} className="gh">
      <Suspense fallback={null}>
        <MusicBoxRing3D />
      </Suspense>
      <header className="gh-bar">
        <div className="gh-bar__inner">
          <span className="gh-brand">
            <span className="gh-brand__mark" aria-hidden="true">
              <Icon name="music" size={16} />
            </span>
            Scorewise
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

      <SectionDots root={pageRef} label={t('home.guest.screensNav')} />

      <section
        data-screen={t('home.guest.screenTop')}
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
          {/* mỗi vế của tiêu đề (ngăn bằng dấu phẩy) một dòng, để không bị ngắt giữa chừng kiểu "mỗi / ngày" */}
          <h1>
            {t('home.guest.heroTitle')
              .split(/(?<=,)\s+/)
              .map((line) => (
                <span key={line} className="gh-hero__line">
                  {line}
                </span>
              ))}
          </h1>
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
      </section>

      <main className="gh-main">
        {failed && <p className="gh-note">{t('home.guest.loadFailed')}</p>}

        {/* hình chòm sao nốt nhạc: nằm dưới phần đầu trang để vòng khuông Für Elise quanh tiêu đề không bị che */}
        <figure className="gh-visual">
          <ScoreConstellation paused={still} label={t('home.guest.demoCaption')} />
          <button
            type="button"
            className="gh-ghost gh-visual__pause"
            aria-pressed={!still}
            onClick={() => setStill((s) => !s)}
          >
            <Icon name={still ? 'play' : 'x'} size={14} />
            {still ? t('home.guest.demoPlay') : t('home.guest.demoPause')}
          </button>
        </figure>

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
          <ol className="gh-steps scr-stagger">
            {STEPS.map((key, i) => (
              <li key={key}>
                <span className="gh-steps__num" aria-hidden="true">
                  {i + 1}
                </span>
                <strong>{t(`home.guest.steps.${key}.title`)}</strong>
                <p>{t(`home.guest.steps.${key}.text`)}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section title={t('home.guest.featuresTitle')} lead={t('home.guest.featuresLead')} variant="wide">
          <ul className="gh-features scr-stagger">
            {FEATURES.map(([key, icon]) => (
              <li key={key}>
                <span className="gh-features__icon" aria-hidden="true">
                  <Icon name={icon} size={22} />
                </span>
                <div>
                  <h3>{t(`home.guest.features.${key}.title`)}</h3>
                  <p>{t(`home.guest.features.${key}.text`)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        {stats && (
          <Section title={t('home.guest.statsTitle')} lead={t('home.guest.statsLead')} variant="stats">
            <dl className="gh-stats scr-stagger">
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
            <div className="gh-composers scr-stagger">
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
          <div className="gh-faq scr-stagger">
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

        <section className="gh-final scr" data-screen={t('home.guest.screenStart')}>
          <div className="gh-final__card">
            <h2 className="scr-title">{t('home.guest.finalTitle')}</h2>
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
