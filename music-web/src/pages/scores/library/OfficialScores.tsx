import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import Pagination from '../../../components/scores/common/Pagination';
import ScoreCard from '../../../components/scores/library/ScoreCard';
import { scoreApi } from '../../../services';
import type { Difficulty, PageResult, ScoreSummary } from '../../../types';
import { DIFFICULTY_LABELS, getScorePath } from '../../../utils/score';
import '../../../components/scores/scores.css';
import { t } from '../../../i18n/core';

const PAGE_SIZE = 12;

/** Trang /scores/official: kho bản nhạc mẫu (bản nhạc chính thức) cho người mới học, từ dễ đến khó (mục 4.5). */
export default function OfficialScores() {
  const navigate = useNavigate();
  const { pathname } = useLocation(); // để trang chi tiết biết người dùng đi từ đâu tới
  const [page, setPage] = useState(0);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [data, setData] = useState<PageResult<ScoreSummary> | null>(null);

  useEffect(() => {
    scoreApi
      .official({ page, size: PAGE_SIZE, keyword: keyword || undefined, difficulty })
      .then((res) => setData(res.data.result))
      .catch(() => toast.error(t('scores.official.loadFailed')));
  }, [page, keyword, difficulty]);

  return (
    <div className="sc-page">
      <main className="sc-container">
        <header className="sc-lib-head">
          <div>
            <h1>{t('common.nav.items.officialLibrary')}</h1>
            <p>{data ? t('scores.official.count', { count: data.totalElements }) : t('scores.official.subtitle')}</p>
          </div>
        </header>

        <form
          className="d-flex gap-2 mb-4"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(0);
            setKeyword(keywordInput.trim());
          }}
        >
          <input
            className="sc-input"
            placeholder={t('scores.explore.searchPlaceholder')}
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
          />
          <select
            className="sc-input"
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
          <button type="submit" className="sc-btn sc-btn--primary">
            {t('common.search')}
          </button>
        </form>

        {data && data.content.length === 0 && (
          <div className="sc-empty">
            <h3>{t('scores.official.emptyTitle')}</h3>
            <p>{t('scores.official.emptyHint')}</p>
          </div>
        )}

        {data && data.content.length > 0 && (
          <div className="sc-grid">
            {data.content.map((s) => (
              <ScoreCard
                key={s.id}
                score={s}
                onOpen={(item) => navigate(getScorePath(item.id, item.processingStatus), { state: { from: pathname } })}
              />
            ))}
          </div>
        )}

        {data && (
          <Pagination
            page={data.pageNumber}
            totalPages={data.totalPages}
            totalElements={data.totalElements}
            onChange={setPage}
          />
        )}
      </main>
    </div>
  );
}
