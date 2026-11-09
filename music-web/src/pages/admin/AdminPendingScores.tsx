import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import Pagination from '../../components/scores/Pagination';
import { scoreApi } from '../../services';
import type { PageResult, ScoreSummary } from '../../types';

const PAGE_SIZE = 20;

const errMsg = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } }).response?.data?.message || fallback;

const formatDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN') : '—');

/** Admin (mục 4.4): duyệt hoặc từ chối các bản nhạc chủ sở hữu xin công khai, cũ nhất trước. */
export default function AdminPendingScores() {
  const [result, setResult] = useState<PageResult<ScoreSummary> | null>(null);
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    scoreApi
      .pendingPublic({ page, size: PAGE_SIZE })
      .then((res) => {
        const data = res.data.result;
        // Duyệt hết bản cuối của một trang thì lùi về trang trước
        if (data.content.length === 0 && page > 0) setPage(page - 1);
        else setResult(data);
      })
      .catch(() => toast.error('Không tải được danh sách bản nhạc chờ duyệt'));
  }, [page, reload]);

  const review = async (score: ScoreSummary, approve: boolean) => {
    let reason: string | undefined;
    if (approve) {
      if (!window.confirm(`Duyệt công khai bản nhạc "${score.title}"? Mọi người dùng đã đăng nhập sẽ xem được.`)) return;
    } else {
      const input = window.prompt(`Lý do từ chối công khai "${score.title}" (có thể bỏ trống):`);
      if (input === null) return;
      reason = input.trim() || undefined;
    }
    setBusyId(score.id);
    try {
      if (approve) await scoreApi.approvePublic(score.id);
      else await scoreApi.rejectPublic(score.id, reason);
      toast.success(approve ? 'Đã duyệt công khai' : 'Đã từ chối công khai');
    } catch (error) {
      // Ví dụ admin khác đã xử lý trước: báo lỗi rồi tải lại danh sách
      toast.error(errMsg(error, 'Thao tác thất bại'));
    } finally {
      setBusyId(null);
      setReload((n) => n + 1);
    }
  };

  const btn = { padding: '0.25rem 0.75rem', fontSize: '0.75rem' };

  return (
    <>
      <div className="adm-page-head">
        <div>
          <h1>Bản nhạc chờ duyệt công khai</h1>
          <p>{result ? `${result.totalElements} bản nhạc đang chờ` : ''}</p>
        </div>
      </div>

      <div className="adm-card">
        <div className="table-responsive">
          <table className="table" style={{ marginTop: 0 }}>
            <thead>
              <tr>
                <th>Tên bản nhạc</th>
                <th>Tác giả</th>
                <th>Chủ sở hữu</th>
                <th>Gửi yêu cầu lúc</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {result?.content.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link to={`/scores/${s.id}`} title="Mở để xem trước khi duyệt">
                      {s.title}
                    </Link>
                  </td>
                  <td>{s.composer || '—'}</td>
                  <td>{s.ownerEmail}</td>
                  <td>{formatDate(s.updatedAt)}</td>
                  <td>
                    <div className="d-flex gap-2">
                      <button
                        className="btn btn-primary"
                        style={btn}
                        disabled={busyId === s.id}
                        onClick={() => review(s, true)}
                      >
                        Duyệt
                      </button>
                      <button
                        className="btn btn-danger"
                        style={btn}
                        disabled={busyId === s.id}
                        onClick={() => review(s, false)}
                      >
                        Từ chối
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {result && result.content.length === 0 && (
                <tr>
                  <td colSpan={5}>Không có bản nhạc nào đang chờ duyệt.</td>
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
