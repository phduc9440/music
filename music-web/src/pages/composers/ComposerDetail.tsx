import { useEffect, useState } from 'react';
import { useLocation, useParams, useViewTransitionState } from 'react-router-dom';
import { Link } from '../../routes/transition-nav';
import { useNavigate } from '../../routes/useTransitionNavigate';
import ComposerPortrait from '../../components/composers/ComposerPortrait';
import PlaylistPicker from '../../components/scores/library/PlaylistPicker';
import ScoreCard from '../../components/scores/library/ScoreCard';
import { BackLink, Icon } from '../../components/ui';
import { composerApi, scoreApi } from '../../services';
import type { Composer, PageResult, ScoreSummary } from '../../types';
import { t } from '../../i18n/core';
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
    <section className="cd-timeline" aria-label={t('composers.timeline')}>
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
        {composer.deathYear ? ` (${t('composers.years', { count: composer.deathYear - birth })})` : ''}
      </p>
    </section>
  );
}

/** Trang /composers/:slug: chân dung, tiểu sử, dòng thời gian, bản công khai và bản trong kho mẫu của nhạc sĩ. */
export default function ComposerDetail() {
  const { slug = '' } = useParams();
  const arriving = useViewTransitionState(`/composers/${slug}`);
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
          <BackLink label={t('composers.title')} to="/composers" />
          <div className="sc-empty">
            <h3>{t('composers.notFoundTitle')}</h3>
            <p>{t('composers.notFoundText')}</p>
          </div>
        </main>
      </div>
    );
  }

  if (!composer) {
    return (
      <div className="sc-page">
        <main className="sc-container" aria-busy="true">
          <div className="cd-skeleton" style={arriving ? { viewTransitionName: 'ui-shared-cover' } : undefined} />
        </main>
      </div>
    );
  }

  const meta = [lifespan(composer), composer.country].filter(Boolean).join(' · ');

  return (
    <div className="sc-page">
      <main className="sc-container">
        <BackLink label={t('composers.title')} to="/composers" />

        <section className="cd-hero">
          <figure className="cd-hero__portrait">
            <ComposerPortrait name={composer.name} imageUrl={composer.imageUrl} />
            {composer.imageUrl && composer.imageSource && (
              <figcaption>
                {t('composers.photo')}{' '}
                <a href={composer.imageSource} target="_blank" rel="noopener noreferrer">
                  {t('composers.photoSource')}
                </a>
                {composer.imageLicense && ` · ${composer.imageLicense}`}
              </figcaption>
            )}
          </figure>
          <div className="cd-hero__text">
            {composer.period && <span className="cd-hero__period">{PERIOD_LABELS[composer.period]}</span>}
            <h1>{composer.name}</h1>
            {meta && <p className="cd-hero__meta">{meta}</p>}
            {composer.aliases && (
              <p className="cd-hero__aliases">{t('composers.aliases', { names: composer.aliases })}</p>
            )}
            {composer.bio ? (
              <p className="cd-hero__bio">{composer.bio}</p>
            ) : (
              <p className="cd-hero__bio cd-hero__bio--empty">{t('composers.noBio')}</p>
            )}
            <div className="cd-hero__actions">
              <Link to={`/explore?composer=${composer.slug}`} className="sc-btn sc-btn--primary">
                <Icon name="globe" size={16} />
                {t('composers.openInExplore')}
              </Link>
            </div>
          </div>
        </section>

        <Timeline composer={composer} />

        <section className="cd-section">
          <header className="cd-section__head">
            <h2>{t('composers.publicSection')}</h2>
            {publicScores && publicScores.totalElements > SHOWN && (
              <Link to={`/explore?composer=${composer.slug}`} className="cd-section__more">
                {t('composers.viewAll', { count: publicScores.totalElements })}
                <Icon name="chevronRight" size={14} />
              </Link>
            )}
          </header>
          {publicScores && publicScores.content.length === 0 && (
            <p className="cd-empty">{t('composers.noPublicOf', { name: composer.name })}</p>
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
                      {t('scores.playlistPicker.title')}
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
              <h2>{t('composers.officialSection')}</h2>
              {official.totalElements > SHOWN && (
                <Link to="/scores/official" className="cd-section__more">
                  {t('composers.openOfficial')}
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
