import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import Pagination from '../../components/scores/Pagination';
import { adminApi, scoreApi } from '../../services';
import type { PageResult, ScoreSummary } from '../../types';

const PAGE_SIZE = 20;

const VISIBILITY_LABEL: Record<string, string> = {
  PRIVATE: 'Riêng tư',
  PENDING: 'Chờ duyệt',
  PUBLIC: 'Công khai',
};

const errMsg = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } }).response?.data?.message || fallback;

const btn = { padding: '0.25rem 0.75rem', fontSize: '0.75rem' };

const formatDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN') : '—');

/** Admin: xem mọi bản nhạc của mọi người dùng, tìm kiếm, lọc theo quyền riêng tư và xóa bản vi phạm. */
export default function AdminScores() {
  const [result, setResult] = useState<PageResult<ScoreSummary> | null>(null);
  const [page, setPage] = useState(0);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [visibility, setVisibility] = useState('');
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .getScores({ page, size: PAGE_SIZE, keyword: keyword || undefined, visibility: visibility || undefined })
      .then((res) => {
        const data = res.data.result;
        // Xóa hết bản cuối của một trang thì lùi về trang trước
        if (data.content.length === 0 && page > 0) setPage(page - 1);
        else setResult(data);
      })
      .catch(() => toast.error('Không tải được danh sách bản nhạc'));
  }, [page, keyword, visibility, reload]);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    setKeyword(keywordInput.trim());
  };

  const run = async (score: ScoreSummary, action: () => Promise<unknown>, okMsg: string, failMsg: string) => {
    setBusyId(score.id);
    try {
      await action();
      toast.success(okMsg);
    } catch (error) {
      toast.error(errMsg(error, failMsg));
    } finally {
      setBusyId(null);
      setReload((n) => n + 1);
    }
  };

  const publish = (score: ScoreSummary) => {
    if (!window.confirm(`Công khai bản nhạc "${score.title}"? Mọi người dùng đã đăng nhập sẽ xem được.`)) return;
    run(score, () => adminApi.setScoreVisibility(score.id, 'PUBLIC'), 'Đã công khai', 'Không đổi được quyền riêng tư');
  };

  const unpublish = (score: ScoreSummary) => {
    const input = window.prompt(
      `Gỡ công khai "${score.title}" (về riêng tư${score.isOfficial ? ', đồng thời rời kho score mẫu' : ''}). Lý do (có thể bỏ trống):`,
    );
    if (input === null) return;
    run(
      score,
      () => adminApi.setScoreVisibility(score.id, 'PRIVATE', input.trim() || undefined),
      'Đã gỡ công khai',
      'Không đổi được quyền riêng tư',
    );
  };

  const toggleOfficial = (score: ScoreSummary) =>
    score.isOfficial
      ? run(score, () => scoreApi.unmarkOfficial(score.id), 'Đã gỡ khỏi kho score mẫu', 'Không gỡ được khỏi kho')
      : run(score, () => scoreApi.markOfficial(score.id), 'Đã thêm vào kho score mẫu', 'Không thêm được vào kho');

  const remove = async (score: ScoreSummary) => {
    if (!window.confirm(`Xóa vĩnh viễn bản nhạc "${score.title}" của ${score.ownerEmail}? Không thể hoàn tác.`)) return;
    setBusyId(score.id);
    try {
      await scoreApi.remove(score.id);
      toast.success('Đã xóa bản nhạc');
    } catch (error) {
      toast.error(errMsg(error, 'Không xóa được bản nhạc'));
    } finally {
      setBusyId(null);
      setReload((n) => n + 1);
    }
  };

  return (
    <>
      <div className="adm-page-head">
        <div>
          <h1>Quản lý bản nhạc</h1>
          <p>{result ? `${result.totalElements} bản nhạc` : ''}</p>
        </div>
        <form onSubmit={search} className="d-flex gap-2">
          <input
            className="form-control"
            placeholder="Tên, tác giả hoặc email chủ sở hữu"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
          />
          <select
            className="form-control"
            value={visibility}
            onChange={(e) => {
              setPage(0);
              setVisibility(e.target.value);
            }}
          >
            <option value="">Tất cả</option>
            {Object.entries(VISIBILITY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-primary">
            Tìm
          </button>
        </form>
      </div>

      <div className="adm-card">
        <div className="table-responsive">
          <table className="table" style={{ marginTop: 0 }}>
            <thead>
              <tr>
                <th>Tên bản nhạc</th>
                <th>Tác giả</th>
                <th>Chủ sở hữu</th>
                <th>Quyền riêng tư</th>
                <th>Kho mẫu</th>
                <th>Cập nhật</th>
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
                  <td>{s.ownerEmail}</td>
                  <td>{VISIBILITY_LABEL[s.visibility] ?? s.visibility}</td>
                  <td>{s.isOfficial ? '✓' : '—'}</td>
                  <td>{formatDate(s.updatedAt)}</td>
                  <td>
                    <div className="d-flex gap-2 flex-wrap">
                      <Link to={`/admin/scores/${s.id}`} className="btn" style={btn}>
                        Xem
                      </Link>
                      {s.visibility === 'PUBLIC' ? (
                        <>
                          <button className="btn" style={btn} disabled={busyId === s.id} onClick={() => toggleOfficial(s)}>
                            {s.isOfficial ? 'Gỡ khỏi kho' : 'Thêm vào kho'}
                          </button>
                          <button className="btn" style={btn} disabled={busyId === s.id} onClick={() => unpublish(s)}>
                            Gỡ công khai
                          </button>
                        </>
                      ) : (
                        <button className="btn btn-primary" style={btn} disabled={busyId === s.id} onClick={() => publish(s)}>
                          Công khai
                        </button>
                      )}
                      <button className="btn btn-danger" style={btn} disabled={busyId === s.id} onClick={() => remove(s)}>
                        Xóa
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {result && result.content.length === 0 && (
                <tr>
                  <td colSpan={7}>Không có bản nhạc nào.</td>
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
