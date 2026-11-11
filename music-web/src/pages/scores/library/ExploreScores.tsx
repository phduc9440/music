import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import Pagination from '../../../components/scores/common/Pagination';
import PlaylistPicker from '../../../components/scores/library/PlaylistPicker';
import ScoreCard from '../../../components/scores/library/ScoreCard';
import { Icon } from '../../../components/ui';
import { composerApi, scoreApi, tagApi } from '../../../services';
import type { Composer, Difficulty, PageResult, ScoreSummary, Tag } from '../../../types';
import { labelMap, t } from '../../../i18n/core';
import { DIFFICULTY_LABELS, getScorePath } from '../../../utils/score';
import '../../../components/scores/scores.css';
import './explore.css';

const PAGE_SIZE = 12;

type ExploreSort = 'NEWEST' | 'VIEWS' | 'RATING';
type Staffs = 1 | 2 | 3;

const SORT_LABELS: Record<ExploreSort, string> = labelMap('scores.explore.sort', ['NEWEST', 'VIEWS', 'RATING']);

const STAFF_LABELS: Record<Staffs, string> = labelMap('scores.explore.staffs', [1, 2, 3]);

const DIFFICULTIES = Object.keys(DIFFICULTY_LABELS) as Difficulty[];

/** Một nhóm lọc trong cột trái: danh sách lựa chọn dạng nút, bấm lại lựa chọn đang chọn để bỏ. */
function FilterGroup<T extends string | number>({
  title,
  options,
  value,
  label,
  onChange,
}: {
  title: string;
  options: T[];
  value: T | null;
  label: (v: T) => ReactNode;
  onChange: (v: T | null) => void;
}) {
  if (options.length === 0) return null;
  return (
    <fieldset className="ex-group">
      <legend>{title}</legend>
      <div className="ex-options">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            className={`ex-option${value === o ? ' ex-option--on' : ''}`}
            aria-pressed={value === o}
            onClick={() => onChange(value === o ? null : o)}
          >
            {label(o)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Trang /explore: bản nhạc công khai của mọi người (mục 2.2 P1, 5.4). Lọc theo thể loại, độ khó, số khuông, khóa nhạc,
 * nhạc sĩ; bộ lọc nằm trên đường dẫn (?composer=...&key=G) nên chia sẻ hoặc quay lại vẫn giữ nguyên.
 */
export default function ExploreScores() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation(); // để trang chi tiết biết người dùng đi từ đâu tới
  const [params, setParams] = useSearchParams();

  const keyword = params.get('q') ?? '';
  const difficulty = (params.get('difficulty') as Difficulty | null) ?? null;
  const tagId = params.get('tag');
  const composerSlug = params.get('composer');
  const staffsParam = Number(params.get('staffs'));
  const staffs = ([1, 2, 3] as const).find((n) => n === staffsParam) ?? null;
  const keySig = params.get('key');
  const sortParam = params.get('sort') as ExploreSort | null;
  const sort: ExploreSort = sortParam && sortParam in SORT_LABELS ? sortParam : 'NEWEST';
  const page = Math.max(0, Number(params.get('page')) || 0);

  const [keywordInput, setKeywordInput] = useState(keyword);
  const [tags, setTags] = useState<Tag[]>([]);
  const [composers, setComposers] = useState<Composer[] | null>(null);
  const [keys, setKeys] = useState<string[]>([]);
  const [data, setData] = useState<PageResult<ScoreSummary> | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false); // cột lọc dạng ngăn kéo trên màn hình nhỏ
  const [composerQuery, setComposerQuery] = useState('');
  const [saving, setSaving] = useState<ScoreSummary | null>(null);

  useEffect(() => {
    // Thiếu danh sách nào thì chỉ mất bộ lọc đó
    tagApi
      .list()
      .then((res) => setTags(res.data.result))
      .catch(() => undefined);
    composerApi
      .list({ limit: 100 })
      .then((res) => setComposers(res.data.result))
      .catch(() => setComposers([]));
    composerApi
      .facets()
      .then((res) => setKeys(res.data.result.keys))
      .catch(() => undefined);
  }, []);

  const composer = useMemo(
    () => (composerSlug ? (composers?.find((c) => c.slug === composerSlug) ?? null) : null),
    [composers, composerSlug],
  );
  // Lọc theo nhạc sĩ cần danh sách nhạc sĩ để đổi slug thành id; chờ tải xong mới gọi
  const waitingComposer = !!composerSlug && composers === null;

  useEffect(() => {
    if (waitingComposer) return;
    let cancelled = false;
    scoreApi
      .explore({
        page,
        size: PAGE_SIZE,
        keyword: keyword || undefined,
        difficulty: difficulty ?? undefined,
        tagId: tagId ?? undefined,
        // slug lạ (nhạc sĩ đã bị xóa) thì không ra bản nào thay vì lặng lẽ bỏ lọc
        composerId: composerSlug ? (composer?.id ?? 'none') : undefined,
        staffs: staffs ?? undefined,
        key: keySig ?? undefined,
        sort,
      })
      .then((res) => !cancelled && setData(res.data.result))
      .catch(() => !cancelled && toast.error(t('scores.explore.loadFailed')));
    return () => {
      cancelled = true;
    };
  }, [page, keyword, difficulty, tagId, composerSlug, composer, staffs, keySig, sort, waitingComposer]);

  /** Đổi một tham số lọc (null = bỏ) và quay về trang đầu. */
  const setParam = (name: string, value: string | number | null) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === null || value === '') next.delete(name);
        else next.set(name, String(value));
        if (name !== 'page') next.delete('page');
        return next;
      },
      { replace: name === 'page' ? false : true },
    );
  };

  const clearFilters = () => {
    setKeywordInput('');
    setParams(sort === 'NEWEST' ? {} : { sort });
  };

  const tagName = tags.find((t) => t.id === tagId)?.name;
  const activeChips: { label: string; clear: () => void }[] = [
    ...(keyword ? [{ label: `“${keyword}”`, clear: () => (setKeywordInput(''), setParam('q', null)) }] : []),
    ...(tagId ? [{ label: tagName ?? t('scores.explore.tag'), clear: () => setParam('tag', null) }] : []),
    ...(difficulty ? [{ label: DIFFICULTY_LABELS[difficulty], clear: () => setParam('difficulty', null) }] : []),
    ...(staffs ? [{ label: STAFF_LABELS[staffs].split(' (')[0], clear: () => setParam('staffs', null) }] : []),
    ...(keySig ? [{ label: t('scores.explore.keyChip', { key: keySig }), clear: () => setParam('key', null) }] : []),
    ...(composerSlug
      ? [{ label: composer?.name ?? t('scores.explore.composer'), clear: () => setParam('composer', null) }]
      : []),
  ];

  const visibleComposers = (composers ?? []).filter(
    (c) => !composerQuery.trim() || c.name.toLowerCase().includes(composerQuery.trim().toLowerCase()),
  );

  const filters = (
    <>
      <FilterGroup
        title={t('scores.explore.tag')}
        options={tags.map((t) => t.id)}
        value={tagId}
        label={(id) => tags.find((t) => t.id === id)?.name ?? id}
        onChange={(v) => setParam('tag', v)}
      />
      <FilterGroup
        title={t('scores.explore.difficulty')}
        options={DIFFICULTIES}
        value={difficulty}
        label={(d) => DIFFICULTY_LABELS[d]}
        onChange={(v) => setParam('difficulty', v)}
      />
      <FilterGroup
        title={t('scores.explore.staffsTitle')}
        options={[1, 2, 3] as Staffs[]}
        value={staffs}
        label={(n) => STAFF_LABELS[n]}
        onChange={(v) => setParam('staffs', v)}
      />
      <FilterGroup
        title={t('scores.explore.key')}
        options={keys}
        value={keySig}
        label={(k) => k}
        onChange={(v) => setParam('key', v)}
      />
      {composers && composers.length > 0 && (
        <fieldset className="ex-group">
          <legend>{t('scores.explore.composer')}</legend>
          <input
            className="sc-input ex-composer-search"
            placeholder={t('scores.explore.composerSearch')}
            value={composerQuery}
            onChange={(e) => setComposerQuery(e.target.value)}
          />
          <ul className="ex-composers">
            {visibleComposers.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`ex-composer${composerSlug === c.slug ? ' ex-composer--on' : ''}`}
                  aria-pressed={composerSlug === c.slug}
                  onClick={() => setParam('composer', composerSlug === c.slug ? null : c.slug)}
                >
                  <span>{c.name}</span>
                  <small>{c.scoreCount}</small>
                </button>
              </li>
            ))}
            {visibleComposers.length === 0 && <li className="ex-muted">{t('scores.explore.noComposerMatch')}</li>}
          </ul>
        </fieldset>
      )}
    </>
  );

  return (
    <div className="sc-page">
      <main className="sc-container">
        <header className="ex-head">
          <div>
            <h1>{t('scores.explore.title')}</h1>
            <p>
              {data ? t('scores.explore.countPublic', { count: data.totalElements }) : t('scores.explore.subtitle')}
              {composer && (
                <>
                  {' '}
                  {t('scores.explore.by')}{' '}
                  <button type="button" className="ex-link" onClick={() => navigate(`/composers/${composer.slug}`)}>
                    {composer.name}
                  </button>
                </>
              )}
            </p>
          </div>
          <form
            className="ex-search"
            onSubmit={(e) => {
              e.preventDefault();
              setParam('q', keywordInput.trim() || null);
            }}
          >
            <Icon name="search" size={16} />
            <input
              placeholder={t('scores.explore.searchPlaceholder')}
              aria-label={t('scores.explore.searchLabel')}
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
            />
            <button type="submit" className="sc-btn sc-btn--primary sc-btn--sm">
              {t('common.search')}
            </button>
          </form>
        </header>

        <div className="ex-toolbar">
          <button
            type="button"
            className="sc-btn sc-btn--sm ex-filter-toggle"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <Icon name="list" size={16} />
            {t('scores.explore.filters')}
            {activeChips.length > 0 ? ` (${activeChips.length})` : ''}
          </button>
          <div className="ex-chips">
            {activeChips.map((chip) => (
              <button key={chip.label} type="button" className="ex-chip" onClick={chip.clear}>
                {chip.label}
                <Icon name="x" size={12} />
              </button>
            ))}
            {activeChips.length > 0 && (
              <button type="button" className="ex-link" onClick={clearFilters}>
                {t('scores.explore.clearFilters')}
              </button>
            )}
          </div>
          <label className="ex-sort">
            <span>{t('scores.explore.sortBy')}</span>
            <select
              className="sc-input"
              value={sort}
              onChange={(e) => setParam('sort', e.target.value === 'NEWEST' ? null : e.target.value)}
            >
              {(Object.keys(SORT_LABELS) as ExploreSort[]).map((s) => (
                <option key={s} value={s}>
                  {SORT_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="ex-layout">
          <aside
            className={`ex-filters${filtersOpen ? ' ex-filters--open' : ''}`}
            aria-label={t('scores.explore.filters')}
          >
            {filters}
          </aside>

          <section className="ex-results" aria-busy={!data}>
            {!data && (
              <div className="sc-grid">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="ex-skeleton" aria-hidden="true" />
                ))}
              </div>
            )}

            {data && data.content.length === 0 && (
              <div className="sc-empty">
                <h3>{t('scores.explore.emptyTitle')}</h3>
                <p>{activeChips.length > 0 ? t('scores.explore.emptyFiltered') : t('scores.explore.emptyNone')}</p>
                {activeChips.length > 0 && (
                  <button type="button" className="sc-btn" onClick={clearFilters}>
                    {t('scores.explore.clearFilters')}
                  </button>
                )}
              </div>
            )}

            {data && data.content.length > 0 && (
              <div className="sc-grid">
                {data.content.map((s) => (
                  <ScoreCard
                    key={s.id}
                    score={s}
                    explore
                    onOpen={(item) =>
                      navigate(getScorePath(item.id, item.processingStatus), { state: { from: pathname + search } })
                    }
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

            {data && (
              <Pagination
                page={data.pageNumber}
                totalPages={data.totalPages}
                totalElements={data.totalElements}
                onChange={(p) => setParam('page', p === 0 ? null : p)}
              />
            )}
          </section>
        </div>
      </main>

      {saving && <PlaylistPicker score={saving} onClose={() => setSaving(null)} />}
    </div>
  );
}
