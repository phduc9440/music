import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import ComposerPortrait from '../../components/composers/ComposerPortrait';
import PlaylistPicker from '../../components/scores/library/PlaylistPicker';
import ScoreCard from '../../components/scores/library/ScoreCard';
import { BackLink, Icon } from '../../components/ui';
import { composerApi, scoreApi } from '../../services';
import type { Composer, PageResult, ScoreSummary } from '../../types';
import { PERIOD_LABELS, PERIOD_SPANS, lifespan } from '../../utils/composer';
import { getScorePath } from '../../utils/score';
import '../../components/scores/scores.css';
import './composers.css';

const SHOWN = 8;
const AXIS_FROM = 1600;
const AXIS_TO = 2030;

const pct = (year: number) =>
  `${((Math.min(Math.max(year, AXIS_FROM), AXIS_TO) - AXIS_FROM) / (AXIS_TO - AXIS_FROM)) * 100}%`;

/** Dòng thời gian 1600–nay: các thời kỳ âm nhạc làm nền, quãng đời nhạc sĩ là một vạch vàng đồng nổi lên trên. */
function Timeline({ composer }: { composer: Composer }) {
  const birth = composer.birthYear;
  if (!birth) return null;
  const end = composer.deathYear ?? new Date().getFullYear();
  return (
    <section className="cd-timeline" aria-label="Dòng thời gian">
      <div className="cd-timeline__track">
        {PERIOD_SPANS.map((p) => (
          <span
            key={p.period}
            className={`cd-timeline__era cd-timeline__era--${p.period.toLowerCase()}${
              composer.period === p.period ? ' cd-timeline__era--on' : ''
            }`}
            style={{ left: pct(p.from), width: `calc(${pct(p.to)} - ${pct(p.from)})` }}
          >
            {PERIOD_LABELS[p.period]}
          </span>
        ))}
        <span
          className="cd-timeline__life"
          style={{ left: pct(birth), width: `max(6px, calc(${pct(end)} - ${pct(birth)}))` }}
          title={lifespan(composer)}
        />
      </div>
      <div className="cd-timeline__axis" aria-hidden="true">
        {[1600, 1700, 1800, 1900, 2000].map((y) => (
          <span key={y} style={{ left: pct(y) }}>
            {y}
          </span>
        ))}
      </div>
      <p className="cd-timeline__caption">
        {composer.name}: {lifespan(composer)}
        {composer.deathYear ? ` (${composer.deathYear - birth} năm)` : ''}
      </p>
    </section>
  );
}

/** Trang /composers/:slug: chân dung, tiểu sử, dòng thời gian, bản công khai và bản trong kho mẫu của nhạc sĩ. */
export default function ComposerDetail() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Kết quả gắn với slug đã tải; slug đổi thì kết quả cũ không còn khớp và tự coi là đang tải (không cần reset trong effect)
  const [loaded, setLoaded] = useState<{
    slug: string;
    composer: Composer | null;
    publicScores?: PageResult<ScoreSummary>;
    official?: PageResult<ScoreSummary>;
  } | null>(null);
  const [saving, setSaving] = useState<ScoreSummary | null>(null);

  const current = loaded?.slug === slug ? loaded : null;
  const composer = current?.composer ?? null;
  const notFound = current !== null && current.composer === null;
  const publicScores = current?.publicScores ?? null;
  const official = current?.official ?? null;

  useEffect(() => {
    let cancelled = false;
    const patch = (change: Partial<NonNullable<typeof loaded>>) =>
      setLoaded((prev) =>
        cancelled ? prev : { ...(prev?.slug === slug ? prev : { slug, composer: null }), ...change },
      );
    composerApi
      .bySlug(slug)
      .then((res) => {
        const c = res.data.result;
        patch({ composer: c });
        scoreApi
          .explore({ composerId: c.id, size: SHOWN, sort: 'VIEWS' })
          .then((r) => patch({ publicScores: r.data.result }))
          .catch(() => undefined);
        scoreApi
          .official({ composerId: c.id, size: SHOWN })
          .then((r) => patch({ official: r.data.result }))
          .catch(() => undefined);
      })
      .catch(() => patch({ composer: null }));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const open = (s: ScoreSummary) => navigate(getScorePath(s.id, s.processingStatus), { state: { from: pathname } });

  if (notFound) {
    return (
      <div className="sc-page">
        <main className="sc-container">
          <BackLink label="Nhạc sĩ" to="/composers" />
          <div className="sc-empty">
            <h3>Không tìm thấy nhạc sĩ</h3>
            <p>Đường dẫn có thể đã thay đổi.</p>
          </div>
        </main>
      </div>
    );
  }

  if (!composer) {
    return (
      <div className="sc-page">
        <main className="sc-container" aria-busy="true">
          <div className="cd-skeleton" />
        </main>
      </div>
    );
  }

  const meta = [lifespan(composer), composer.country].filter(Boolean).join(' · ');

  return (
    <div className="sc-page">
      <main className="sc-container">
        <BackLink label="Nhạc sĩ" to="/composers" />

        <section className="cd-hero">
          <figure className="cd-hero__portrait">
            <ComposerPortrait name={composer.name} imageUrl={composer.imageUrl} />
            {composer.imageUrl && composer.imageSource && (
              <figcaption>
                Ảnh:{' '}
                <a href={composer.imageSource} target="_blank" rel="noopener noreferrer">
                  nguồn
                </a>
                {composer.imageLicense && ` · ${composer.imageLicense}`}
              </figcaption>
            )}
          </figure>
          <div className="cd-hero__text">
            {composer.period && <span className="cd-hero__period">{PERIOD_LABELS[composer.period]}</span>}
            <h1>{composer.name}</h1>
            {meta && <p className="cd-hero__meta">{meta}</p>}
            {composer.aliases && <p className="cd-hero__aliases">Còn được ghi là: {composer.aliases}</p>}
            {composer.bio ? (
              <p className="cd-hero__bio">{composer.bio}</p>
            ) : (
              <p className="cd-hero__bio cd-hero__bio--empty">Chưa có tiểu sử.</p>
            )}
            <div className="cd-hero__actions">
              <Link to={`/explore?composer=${composer.slug}`} className="sc-btn sc-btn--primary">
                <Icon name="globe" size={16} />
                Bản công khai trong Khám phá
              </Link>
            </div>
          </div>
        </section>

        <Timeline composer={composer} />

        <section className="cd-section">
          <header className="cd-section__head">
            <h2>Bản nhạc công khai</h2>
            {publicScores && publicScores.totalElements > SHOWN && (
              <Link to={`/explore?composer=${composer.slug}`} className="cd-section__more">
                Xem tất cả {publicScores.totalElements} bản
                <Icon name="chevronRight" size={14} />
              </Link>
            )}
          </header>
          {publicScores && publicScores.content.length === 0 && (
            <p className="cd-empty">Chưa có bản công khai nào của {composer.name}.</p>
          )}
          {publicScores && publicScores.content.length > 0 && (
            <div className="sc-grid">
              {publicScores.content.map((s) => (
                <ScoreCard
                  key={s.id}
                  score={s}
                  explore
                  onOpen={open}
                  actions={
                    <button type="button" className="sc-btn sc-btn--sm" onClick={() => setSaving(s)}>
                      <Icon name="plus" size={14} />
                      Lưu vào playlist
                    </button>
                  }
                />
              ))}
            </div>
          )}
        </section>

        {official && official.content.length > 0 && (
          <section className="cd-section">
            <header className="cd-section__head">
              <h2>Trong kho score mẫu</h2>
              {official.totalElements > SHOWN && (
                <Link to="/scores/official" className="cd-section__more">
                  Mở kho score mẫu
                  <Icon name="chevronRight" size={14} />
                </Link>
              )}
            </header>
            <div className="sc-grid">
              {official.content.map((s) => (
                <ScoreCard key={s.id} score={s} explore onOpen={open} />
              ))}
            </div>
          </section>
        )}
      </main>

      {saving && <PlaylistPicker score={saving} onClose={() => setSaving(null)} />}
    </div>
  );
}
