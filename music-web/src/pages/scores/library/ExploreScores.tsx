import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import Pagination from '../../../components/scores/common/Pagination';
import ScoreCard from '../../../components/scores/library/ScoreCard';
import { scoreApi, tagApi } from '../../../services';
import type { Difficulty, PageResult, ScoreSummary, Tag } from '../../../types';
import { DIFFICULTY_LABELS, getScorePath } from '../../../utils/score';
import '../../../components/scores/scores.css';

const PAGE_SIZE = 12;

type ExploreSort = 'NEWEST' | 'VIEWS' | 'RATING';

const SORT_LABELS: Record<ExploreSort, string> = {
  NEWEST: 'Mới nhất',
  VIEWS: 'Xem nhiều',
  RATING: 'Đánh giá cao',
};

/** Trang /explore: bản nhạc đang công khai của mọi người, tìm theo tên/tác giả, lọc độ khó và thể loại. */
export default function ExploreScores() {
  const navigate = useNavigate();
  const { pathname } = useLocation(); // để trang chi tiết biết người dùng đi từ đâu tới
  const [page, setPage] = useState(0);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [tagId, setTagId] = useState('');
  const [sort, setSort] = useState<ExploreSort>('NEWEST');
  const [tags, setTags] = useState<Tag[]>([]);
  const [data, setData] = useState<PageResult<ScoreSummary> | null>(null);

  useEffect(() => {
    tagApi
      .list()
      .then((res) => setTags(res.data.result))
      .catch(() => undefined); // không có danh sách thể loại thì chỉ mất bộ lọc đó
  }, []);

  useEffect(() => {
    let cancelled = false;
    scoreApi
      .explore({ page, size: PAGE_SIZE, keyword: keyword || undefined, difficulty, tagId: tagId || undefined, sort })
      .then((res) => !cancelled && setData(res.data.result))
      .catch(() => !cancelled && toast.error('Không tải được danh sách bản nhạc công khai'));
    return () => {
      cancelled = true;
    };
  }, [page, keyword, difficulty, tagId, sort]);

  // Đổi bộ lọc thì quay về trang đầu
  const change =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setPage(0);
      setter(value);
    };

  return (
    <div className="sc-page">
      <main className="sc-container">
        <header className="sc-lib-head">
          <div>
            <h1>Khám phá</h1>
            <p>{data ? `${data.totalElements} bản nhạc công khai` : 'Bản nhạc người dùng chia sẻ cho cộng đồng'}</p>
          </div>
        </header>

        <form
          className="d-flex gap-2 mb-4 flex-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            change(setKeyword)(keywordInput.trim());
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
            aria-label="Độ khó"
            value={difficulty}
            onChange={(e) => change(setDifficulty)(e.target.value as Difficulty | '')}
          >
            <option value="">Mọi độ khó</option>
            {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((d) => (
              <option key={d} value={d}>
                {DIFFICULTY_LABELS[d]}
              </option>
            ))}
          </select>
          <select
            className="sc-input"
            aria-label="Thể loại"
            value={tagId}
            onChange={(e) => change(setTagId)(e.target.value)}
          >
            <option value="">Mọi thể loại</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            className="sc-input"
            aria-label="Sắp xếp"
            value={sort}
            onChange={(e) => change(setSort)(e.target.value as ExploreSort)}
          >
            {(Object.keys(SORT_LABELS) as ExploreSort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </select>
          <button type="submit" className="sc-btn sc-btn--primary">
            Tìm
          </button>
        </form>

        {data && data.content.length === 0 && (
          <div className="sc-empty">
            <h3>Chưa có bản nhạc công khai nào</h3>
            <p>
              {keyword || difficulty || tagId
                ? 'Không có bản nào khớp bộ lọc. Thử bỏ bớt điều kiện tìm.'
                : 'Khi người dùng chia sẻ bản nhạc và được quản trị viên duyệt, chúng sẽ xuất hiện ở đây.'}
            </p>
          </div>
        )}

        {data && data.content.length > 0 && (
          <div className="sc-grid">
            {data.content.map((s) => (
              <ScoreCard
                key={s.id}
                score={s}
                explore
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
