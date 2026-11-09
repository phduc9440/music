import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { scoreApi } from '../../services';
import type { ScoreSummary } from '../../types';

const errMsg = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } }).response?.data?.message || fallback;

/** Admin: duyệt hoặc từ chối các bản nhạc chủ sở hữu xin công khai. */
export default function AdminPendingScores() {
  const [scores, setScores] = useState<ScoreSummary[]>([]);
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    scoreApi
      .pendingPublic({ page: 0, size: 50 })
      .then((res) => setScores(res.data.result.content))
      .catch(() => toast.error('Không tải được danh sách bản nhạc chờ duyệt'));
  }, [reload]);

  const review = async (score: ScoreSummary, approve: boolean) => {
    let reason: string | undefined;
    if (!approve) {
      const input = window.prompt('Lý do từ chối công khai (có thể bỏ trống):');
      if (input === null) return;
      reason = input.trim() || undefined;
    }
    setBusyId(score.id);
    try {
      if (approve) await scoreApi.approvePublic(score.id);
      else await scoreApi.rejectPublic(score.id, reason);
      toast.success(approve ? 'Đã duyệt công khai' : 'Đã từ chối công khai');
      setReload((n) => n + 1);
    } catch (error) {
      toast.error(errMsg(error, 'Thao tác thất bại'));
    } finally {
      setBusyId(null);
    }
  };

  const btn = { padding: '0.25rem 0.75rem', fontSize: '0.75rem' };

  return (
    <>
      <div className="adm-page-head">
        <div>
          <h1>Bản nhạc chờ duyệt công khai</h1>
          <p>{scores.length} bản nhạc đang chờ</p>
        </div>
      </div>

      <div className="adm-card">
        <div className="table-responsive">
          <table className="table" style={{ marginTop: 0 }}>
            <thead>
              <tr>
                <th>Tên bản nhạc</th>
                <th>Chủ sở hữu</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {scores.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link to={`/scores/${s.id}`}>{s.title}</Link>
                  </td>
                  <td>{s.ownerEmail}</td>
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
              {scores.length === 0 && (
                <tr>
                  <td colSpan={3}>Không có bản nhạc nào đang chờ duyệt.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
