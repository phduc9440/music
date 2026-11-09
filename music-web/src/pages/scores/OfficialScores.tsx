import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import NotificationBell from '../../components/NotificationBell';
import Pagination from '../../components/scores/Pagination';
import ScoreCard from '../../components/scores/ScoreCard';
import { scoreApi } from '../../services';
import type { Difficulty, PageResult, ScoreSummary } from '../../types';
import { DIFFICULTY_LABELS, getScorePath } from '../../utils/score';
import '../../components/scores/scores.css';

const PAGE_SIZE = 12;

/** Trang /scores/official: kho score mẫu (bản nhạc chính thức) cho người mới học, từ dễ đến khó (mục 4.5). */
export default function OfficialScores() {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [data, setData] = useState<PageResult<ScoreSummary> | null>(null);

  useEffect(() => {
    scoreApi
      .official({ page, size: PAGE_SIZE, keyword: keyword || undefined, difficulty })
      .then((res) => setData(res.data.result))
      .catch(() => toast.error('Không tải được kho score mẫu'));
  }, [page, keyword, difficulty]);

  return (
    <div className="sc-page">
      <nav className="navbar">
        <div className="navbar-brand">Music App</div>
        <div className="navbar-nav">
          <NotificationBell />
          <button className="sc-btn sc-btn--sm" onClick={() => navigate('/scores')}>
            ‹ Thư viện
          </button>
        </div>
      </nav>

      <main className="sc-container">
        <header className="sc-lib-head">
          <div>
            <h1>Kho score mẫu</h1>
            <p>{data ? `${data.totalElements} bản nhạc, sắp từ dễ đến khó` : 'Bản nhạc chọn lọc cho người mới học'}</p>
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
            placeholder="Tìm theo tên hoặc tác giả"
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
            <option value="">Mọi độ khó</option>
            {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((d) => (
              <option key={d} value={d}>
                {DIFFICULTY_LABELS[d]}
              </option>
            ))}
          </select>
          <button type="submit" className="sc-btn sc-btn--primary">
            Tìm
          </button>
        </form>

        {data && data.content.length === 0 && (
          <div className="sc-empty">
            <h3>Chưa có bản nhạc mẫu nào</h3>
            <p>Quản trị viên sẽ thêm các bản nhạc chọn lọc vào kho này.</p>
          </div>
        )}

        {data && data.content.length > 0 && (
          <div className="sc-grid">
            {data.content.map((s) => (
              <ScoreCard
                key={s.id}
                score={s}
                onOpen={(item) => navigate(getScorePath(item.id, item.processingStatus))}
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
