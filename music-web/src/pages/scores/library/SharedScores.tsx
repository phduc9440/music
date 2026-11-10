import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import Pagination from '../../../components/scores/common/Pagination';
import ScoreCard from '../../../components/scores/library/ScoreCard';
import { scoreApi } from '../../../services';
import type { PageResult, ScoreSummary } from '../../../types';
import { getScorePath } from '../../../utils/score';
import '../../../components/scores/scores.css';

const PAGE_SIZE = 12;

/** Trang /scores/shared: bản nhạc người khác chia sẻ cho tôi. */
export default function SharedScores() {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [data, setData] = useState<PageResult<ScoreSummary> | null>(null);

  useEffect(() => {
    scoreApi
      .sharedWithMe({ page, size: PAGE_SIZE })
      .then((res) => setData(res.data.result))
      .catch(() => toast.error('Không tải được danh sách bản nhạc được chia sẻ'));
  }, [page]);

  return (
    <div className="sc-page">

      <main className="sc-container">
        <header className="sc-lib-head">
          <div>
            <h1>Được chia sẻ với tôi</h1>
            <p>{data ? `${data.totalElements} bản nhạc` : 'Bản nhạc người khác chia sẻ cho bạn'}</p>
          </div>
        </header>

        {data && data.content.length === 0 && (
          <div className="sc-empty">
            <h3>Chưa có bản nhạc nào được chia sẻ</h3>
            <p>Khi ai đó gửi liên kết hoặc mời bạn, bản nhạc sẽ hiện ở đây.</p>
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
          <Pagination page={page} totalPages={data.totalPages} totalElements={data.totalElements} onChange={setPage} />
        )}
      </main>
    </div>
  );
}
