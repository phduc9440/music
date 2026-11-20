import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import Pagination from '../../../components/scores/common/Pagination';
import { LibrarySkeleton } from '../../../components/scores/library/LibraryStates';
import ScoreGrid from '../../../components/scores/library/ScoreGrid';
import Icon from '../../../components/ui/Icon';
import { scoreApi } from '../../../services';
import type { Difficulty, PageResult, ScoreSummary } from '../../../types';
import { DIFFICULTY_LABELS, MAX_KEYWORD } from '../../../utils/score';
import '../../../components/scores/scores.css';
import './ScoreLibrary.css';
import { t } from '../../../i18n/core';

const PAGE_SIZE = 12;

/** Trang /scores/official: kho bản nhạc mẫu (bản nhạc chính thức) cho người mới học, từ dễ đến khó (mục 4.5). */
export default function OfficialScores() {
  const [page, setPage] = useState(0);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  // key = bộ lọc của lần tải xong gần nhất, để làm mờ lưới cũ khi đang tải theo bộ lọc mới
  const [loaded, setLoaded] = useState<{ key: string; data: PageResult<ScoreSummary> | null }>({ key: '', data: null });
  const requestKey = [page, keyword, difficulty].join('|');

  // Debounce ô tìm kiếm 400ms như "Bản nhạc của tôi"
  useEffect(() => {
    const timer = setTimeout(() => {
      setKeyword(keywordInput.trim().slice(0, MAX_KEYWORD));
      setPage(0);
    }, 400);
    return () => clearTimeout(timer);
  }, [keywordInput]);

  useEffect(() => {
    let cancelled = false;
    scoreApi
      .official({ page, size: PAGE_SIZE, keyword: keyword || undefined, difficulty })
      .then((res) => !cancelled && setLoaded({ key: requestKey, data: res.data.result }))
      .catch(() => {
        if (cancelled) return;
        toast.error(t('scores.official.loadFailed'));
        setLoaded((prev) => ({ ...prev, key: requestKey }));
      });
    return () => {
      cancelled = true;
    };
  }, [page, keyword, difficulty, requestKey]);

  const data = loaded.data;

  return (
    <div className="sc-page sc-lib">
      <main className="sc-container">
        <header className="sc-lib-head sc-lib-hero ui-stage">
          <div>
            <h1>{t('common.nav.items.officialLibrary')}</h1>
            <p>{data ? t('scores.official.count', { count: data.totalElements }) : t('scores.official.subtitle')}</p>
          </div>
        </header>

        <div className="sc-filters sc-filters--compact">
          <label className="sc-search">
            <Icon name="search" size={18} />
            <input
              className="sc-input"
              placeholder={t('scores.explore.searchPlaceholder')}
              aria-label={t('scores.explore.searchLabel')}
              value={keywordInput}
              maxLength={MAX_KEYWORD}
              onChange={(e) => setKeywordInput(e.target.value)}
            />
          </label>
          <select
            className="sc-input"
            aria-label={t('scores.filters.byDifficulty')}
            value={difficulty}
            onChange={(e) => {
              setPage(0);
              setDifficulty(e.target.value as Difficulty | '');
            }}
          >
            <option value="">{t('scores.filters.anyDifficulty')}</option>
            {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((d) => (
              <option key={d} value={d}>
                {DIFFICULTY_LABELS[d]}
              </option>
            ))}
          </select>
        </div>

        {!data && loaded.key === '' && <LibrarySkeleton />}

        {data && data.content.length === 0 && (
          <div className="sc-empty">
            <h3>{t('scores.official.emptyTitle')}</h3>
            <p>{t('scores.official.emptyHint')}</p>
          </div>
        )}

        {data && data.content.length > 0 && (
          <ScoreGrid scores={data.content} refetching={loaded.key !== requestKey} showTip />
        )}

        {data && (
          <Pagination page={page} totalPages={data.totalPages} totalElements={data.totalElements} onChange={setPage} />
        )}
      </main>
    </div>
  );
}
