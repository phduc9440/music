import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import Pagination from '../../components/scores/Pagination';
import { scoreApi } from '../../services';
import type { PageResult, ScoreSummary } from '../../types';
import { DIFFICULTY_LABELS } from '../../utils/score';

const PAGE_SIZE = 20;

const errMsg = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } }).response?.data?.message || fallback;

type Tab = 'library' | 'candidates';

/** Admin (mục 4.5): quản lý kho score mẫu, gồm xem kho, gỡ bản khỏi kho và thêm bản nhạc công khai vào kho. */
export default function AdminOfficialScores() {
  const [tab, setTab] = useState<Tab>('library');
  const [page, setPage] = useState(0);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [result, setResult] = useState<PageResult<ScoreSummary> | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const switchTab = (next: Tab) => {
    setTab(next);
    setPage(0);
    setKeyword('');
    setKeywordInput('');
    setResult(null);
  };

  useEffect(() => {
    const request =
      tab === 'library'
        ? scoreApi.official({ page, size: PAGE_SIZE, keyword: keyword || undefined })
        : scoreApi.officialCandidates({ page, size: PAGE_SIZE, keyword: keyword || undefined });
    request
      .then((res) => {
        const data = res.data.result;
        // Xử lý hết bản cuối của một trang thì lùi về trang trước
        if (data.content.length === 0 && page > 0) setPage(page - 1);
        else setResult(data);
      })
      .catch(() => toast.error('Không tải được danh sách bản nhạc'));
  }, [tab, page, keyword, reload]);

  const toggle = useCallback(
    async (score: ScoreSummary) => {
      const adding = tab === 'candidates';
      const message = adding
        ? `Thêm "${score.title}" vào kho score mẫu? Sau đó chỉ ADMIN được sửa hoặc xóa bản nhạc này.`
        : `Gỡ "${score.title}" khỏi kho score mẫu? Bản nhạc vẫn được giữ và vẫn công khai.`;
      if (!window.confirm(message)) return;
      setBusyId(score.id);
      try {
        if (adding) await scoreApi.markOfficial(score.id);
        else await scoreApi.unmarkOfficial(score.id);
        toast.success(adding ? 'Đã thêm vào kho score mẫu' : 'Đã gỡ khỏi kho score mẫu');
      } catch (error) {
        toast.error(errMsg(error, 'Thao tác thất bại'));
      } finally {
        setBusyId(null);
        setReload((n) => n + 1);
      }
    },
    [tab],
  );

  const btn = { padding: '0.25rem 0.75rem', fontSize: '0.75rem' };

  return (
    <>
      <div className="adm-page-head">
        <div>
          <h1>Kho score mẫu</h1>
          <p>Bản nhạc chọn lọc cho người mới học. Người dùng xem ở mục “Kho score mẫu” trong thư viện.</p>
        </div>
        <form
          className="d-flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(0);
            setKeyword(keywordInput.trim());
          }}
        >
          <input
            className="form-control"
            placeholder="Tìm theo tên hoặc tác giả"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
          />
          <button type="submit" className="btn btn-primary">
            Tìm
          </button>
        </form>
      </div>

      <div className="d-flex gap-2 mb-4">
        <button className={`btn ${tab === 'library' ? 'btn-primary' : ''}`} onClick={() => switchTab('library')}>
          Trong kho
        </button>
        <button className={`btn ${tab === 'candidates' ? 'btn-primary' : ''}`} onClick={() => switchTab('candidates')}>
          Thêm vào kho
        </button>
      </div>

      <div className="adm-card">
        <div className="table-responsive">
          <table className="table" style={{ marginTop: 0 }}>
            <thead>
              <tr>
                <th>Tên bản nhạc</th>
                <th>Tác giả</th>
                <th>Độ khó</th>
                {tab === 'candidates' && <th>Chủ sở hữu</th>}
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {result?.content.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link to={`/admin/scores/${s.id}`}>{s.title}</Link>
                  </td>
                  <td>{s.composer || '—'}</td>
                  <td>{s.difficulty ? DIFFICULTY_LABELS[s.difficulty] : '—'}</td>
                  {tab === 'candidates' && <td>{s.ownerEmail}</td>}
                  <td>
                    <button
                      className={`btn ${tab === 'library' ? 'btn-danger' : 'btn-primary'}`}
                      style={btn}
                      disabled={busyId === s.id}
                      onClick={() => toggle(s)}
                    >
                      {tab === 'library' ? 'Gỡ khỏi kho' : 'Thêm vào kho'}
                    </button>
                  </td>
                </tr>
              ))}
              {result && result.content.length === 0 && (
                <tr>
                  <td colSpan={tab === 'candidates' ? 5 : 4}>
                    {tab === 'library'
                      ? 'Kho chưa có bản nhạc nào.'
                      : 'Không có bản nhạc công khai nào để thêm (chỉ bản đã công khai mới thêm được).'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {result && (
          <Pagination
            page={result.pageNumber}
            totalPages={result.totalPages}
            totalElements={result.totalElements}
            onChange={setPage}
          />
        )}
      </div>
    </>
  );
}
