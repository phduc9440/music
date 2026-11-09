import { useEffect, useState } from 'react';
import NotificationBell from '../../components/NotificationBell';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { LibraryEmpty, LibrarySkeleton } from '../../components/scores/LibraryStates';
import Pagination from '../../components/scores/Pagination';
import ScoreCard from '../../components/scores/ScoreCard';
import ScoreFilters from '../../components/scores/ScoreFilters';
import { scoreApi, tagApi } from '../../services';
import type { Difficulty, PageResult, ProcessingStatus, ScoreSort, ScoreSource, ScoreSummary, Tag } from '../../types';
import { getScorePath, MAX_KEYWORD, POLL_INTERVAL_MS } from '../../utils/score';
import '../../components/scores/scores.css';
import './ScoreLibrary.css';

const PAGE_SIZE = 12;

/** Trang /scores: thư viện "Bản nhạc của tôi" (doc mục 2.0). */
export default function ScoreLibrary() {
  const navigate = useNavigate();

  // Bộ lọc
  const [page, setPage] = useState(0);
  const [keywordInput, setKeywordInput] = useState(''); // giá trị đang gõ
  const [keyword, setKeyword] = useState(''); // giá trị đã debounce, dùng để gọi API
  const [status, setStatus] = useState<ProcessingStatus | ''>('');
  const [source, setSource] = useState<ScoreSource | ''>('');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [tagId, setTagId] = useState('');
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [sort, setSort] = useState<ScoreSort>('newest');

  // Dữ liệu: key = bộ lọc của lần tải xong gần nhất, dùng để biết đang tải lại hay không
  const [loaded, setLoaded] = useState<{ key: string; data: PageResult<ScoreSummary> | null }>({
    key: '',
    data: null,
  });
  const [tick, setTick] = useState(0); // tăng lên để tải lại (polling)
  const requestKey = [page, keyword, status, source, difficulty, tagId, sort].join('|');

  // Danh sách thể loại cho ô lọc; lỗi thì ô lọc chỉ còn "Mọi thể loại", không chặn trang
  useEffect(() => {
    tagApi
      .list()
      .then((res) => setAllTags(res.data.result))
      .catch(() => setAllTags([]));
  }, []);

  // Debounce ô tìm kiếm 400ms để không gọi API sau mỗi phím gõ
  useEffect(() => {
    const t = setTimeout(() => {
      setKeyword(keywordInput.trim().slice(0, MAX_KEYWORD));
      setPage(0);
    }, 400);
    return () => clearTimeout(t);
  }, [keywordInput]);

  // Gọi API mỗi khi bộ lọc / trang đổi hoặc tới nhịp polling
  useEffect(() => {
    let cancelled = false;
    scoreApi
      .list({ page, size: PAGE_SIZE, keyword, status, source, difficulty, tagId, sort })
      .then((res) => {
        if (!cancelled) setLoaded({ key: requestKey, data: res.data.result });
      })
      .catch(() => {
        if (cancelled) return;
        toast.error('Không tải được thư viện bản nhạc');
        setLoaded((prev) => ({ ...prev, key: requestKey }));
      });
    return () => {
      cancelled = true;
    };
  }, [page, keyword, status, source, difficulty, tagId, sort, tick, requestKey]);

  // Còn bản nhạc PENDING/PROCESSING thì cứ 5 giây tải lại một lần để thấy trạng thái mới
  const data = loaded.data;
  const hasRunning = data?.content.some((s) => s.processingStatus === 'PENDING' || s.processingStatus === 'PROCESSING');
  useEffect(() => {
    if (!hasRunning) return;
    const t = setInterval(() => setTick((n) => n + 1), POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [hasRunning]);

  const isInitialLoading = loaded.data === null && loaded.key === '';
  const isRefetching = loaded.key !== requestKey;
  const hasFilter = Boolean(keyword || status || source || difficulty || tagId);

  // Đổi bộ lọc thì quay về trang đầu
  const changeFilter =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      setPage(0);
    };

  const resetFilters = () => {
    setKeywordInput('');
    setKeyword('');
    setStatus('');
    setSource('');
    setDifficulty('');
    setTagId('');
    setSort('newest');
    setPage(0);
  };

  return (
    <div className="sc-page">
      <nav className="navbar">
        <div className="navbar-brand">Music App</div>
        <div className="navbar-nav">
          <NotificationBell />
          {localStorage.getItem('role') === 'ADMIN' && (
            <button className="sc-btn sc-btn--sm" onClick={() => navigate('/admin')}>
              Quản trị
            </button>
          )}
          <button className="sc-btn sc-btn--sm" onClick={() => navigate('/scores/official')}>
            Kho score mẫu
          </button>
          <button className="sc-btn sc-btn--sm" onClick={() => navigate('/scores/shared')}>
            Được chia sẻ với tôi
          </button>
          <button className="sc-btn sc-btn--sm" onClick={() => navigate('/playlists')}>
            Playlist
          </button>
          <button className="sc-btn sc-btn--sm" onClick={() => navigate('/practice-history')}>
            Lịch sử tập
          </button>
          <button className="sc-btn sc-btn--sm" onClick={() => navigate('/practice-stats')}>
            Chuỗi luyện tập
          </button>
          <button className="sc-btn sc-btn--sm" onClick={() => navigate('/profile')}>
            Hồ sơ
          </button>
        </div>
      </nav>

      <main className="sc-container">
        <header className="sc-lib-head">
          <div>
            <h1>Bản nhạc của tôi</h1>
            <p>{data ? `${data.totalElements} bản nhạc trong thư viện` : 'Quản lý và theo dõi các bản nhạc'}</p>
          </div>
          <button className="sc-btn sc-btn--primary" onClick={() => navigate('/scores/upload')}>
            + Tải bản nhạc lên
          </button>
        </header>

        <ScoreFilters
          keyword={keywordInput}
          status={status}
          source={source}
          difficulty={difficulty}
          tags={allTags}
          tagId={tagId}
          sort={sort}
          onKeyword={setKeywordInput}
          onStatus={changeFilter(setStatus)}
          onSource={changeFilter(setSource)}
          onDifficulty={changeFilter(setDifficulty)}
          onTag={changeFilter(setTagId)}
          onSort={changeFilter(setSort)}
        />

        {isInitialLoading && <LibrarySkeleton />}

        {data && data.content.length === 0 && <LibraryEmpty filtered={hasFilter} onReset={resetFilters} />}

        {data && data.content.length > 0 && (
          <div className={`sc-grid ${isRefetching ? 'is-refetching' : ''}`}>
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
          <Pagination page={page} totalPages={data.totalPages} totalElements={data.totalElements} onChange={setPage} />
        )}
      </main>
    </div>
  );
}
