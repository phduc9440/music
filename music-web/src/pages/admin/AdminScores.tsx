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

const SOURCE_LABEL: Record<string, string> = { OMR: 'Số hóa (OMR)', IMPORT: 'Nhập file', MANUAL: 'Tạo trong editor' };
const DIFFICULTY_LABEL: Record<string, string> = { EASY: 'Dễ', MEDIUM: 'Trung bình', HARD: 'Khó', EXPERT: 'Chuyên gia' };
const SORT_LABEL: Record<string, string> = {
  UPDATED: 'Mới cập nhật',
  CREATED: 'Mới tạo',
  TITLE: 'Tên A-Z',
  VIEWS: 'Nhiều lượt xem',
};

const errMsg = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } }).response?.data?.message || fallback;

const btn = { padding: '0.25rem 0.75rem', fontSize: '0.75rem' };

const formatDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN') : '—');

/** Admin: xem mọi bản nhạc của mọi người dùng, tìm kiếm, lọc, sắp xếp; thao tác từng bản hoặc hàng loạt. */
export default function AdminScores() {
  const [result, setResult] = useState<PageResult<ScoreSummary> | null>(null);
  const [page, setPage] = useState(0);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [visibility, setVisibility] = useState('');
  const [official, setOfficial] = useState('');
  const [source, setSource] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [sort, setSort] = useState('UPDATED');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .getScores({
        page,
        size: PAGE_SIZE,
        keyword: keyword || undefined,
        visibility: visibility || undefined,
        official: official || undefined,
        source: source || undefined,
        difficulty: difficulty || undefined,
        sort,
      })
      .then((res) => {
        const data = res.data.result;
        // Xóa hết bản cuối của một trang thì lùi về trang trước
        if (data.content.length === 0 && page > 0) setPage(page - 1);
        else {
          setResult(data);
          // Bản vừa bị xóa/đổi khỏi trang thì bỏ khỏi danh sách đã chọn
          const ids = new Set(data.content.map((r) => r.id));
          setSelected((prev) => (prev.size === 0 ? prev : new Set([...prev].filter((id) => ids.has(id)))));
        }
      })
      .catch(() => toast.error('Không tải được danh sách bản nhạc'));
  }, [page, keyword, visibility, official, source, difficulty, sort, reload]);

  // Đổi bộ lọc, trang hoặc dữ liệu thì bỏ chọn để không thao tác nhầm lên bản đã không còn hiển thị
  const changeFilter = (apply: () => void) => {
    apply();
    setPage(0);
    setSelected(new Set());
  };

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const rows = result?.content ?? [];
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)));

  const bulk = async (action: 'PUBLIC' | 'PRIVATE' | 'DELETE') => {
    const ids = [...selected];
    if (ids.length === 0) return;
    let reason: string | undefined;
    if (action === 'DELETE') {
      if (!window.confirm(`Xóa vĩnh viễn ${ids.length} bản nhạc đã chọn? Không thể hoàn tác.`)) return;
    } else if (action === 'PUBLIC') {
      if (!window.confirm(`Công khai ${ids.length} bản nhạc đã chọn?`)) return;
    } else {
      const input = window.prompt(
        `Gỡ công khai ${ids.length} bản nhạc đã chọn (về riêng tư, bản trong kho mẫu sẽ rời kho). Lý do (có thể bỏ trống):`,
      );
      if (input === null) return;
      reason = input.trim() || undefined;
    }
    setBulkBusy(true);
    try {
      const res = await adminApi.bulkScores(ids, action, reason);
      const { success, failures } = res.data.result;
      if (failures.length === 0) {
        toast.success(`Đã xử lý ${success} bản nhạc`);
      } else {
        const titleOf = (id: string) => rows.find((r) => r.id === id)?.title ?? id;
        toast.warn(
          `Thành công ${success}, lỗi ${failures.length}: ` +
            failures.map((f) => `"${titleOf(f.id)}" (${f.message})`).join('; '),
          { autoClose: 10000 },
        );
      }
    } catch (error) {
      toast.error(errMsg(error, 'Thao tác hàng loạt thất bại'));
    } finally {
      setBulkBusy(false);
      setSelected(new Set());
      setReload((n) => n + 1);
    }
  };

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    setSelected(new Set());
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
          <button type="submit" className="btn btn-primary">
            Tìm
          </button>
        </form>
      </div>

      <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Bộ lọc và sắp xếp">
        <select
          className="form-control"
          style={{ width: 'auto' }}
          aria-label="Quyền riêng tư"
          value={visibility}
          onChange={(e) => changeFilter(() => setVisibility(e.target.value))}
        >
          <option value="">Mọi quyền riêng tư</option>
          {Object.entries(VISIBILITY_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          className="form-control"
          style={{ width: 'auto' }}
          aria-label="Kho mẫu"
          value={official}
          onChange={(e) => changeFilter(() => setOfficial(e.target.value))}
        >
          <option value="">Kho mẫu: tất cả</option>
          <option value="true">Trong kho mẫu</option>
          <option value="false">Ngoài kho mẫu</option>
        </select>
        <select
          className="form-control"
          style={{ width: 'auto' }}
          aria-label="Nguồn"
          value={source}
          onChange={(e) => changeFilter(() => setSource(e.target.value))}
        >
          <option value="">Mọi nguồn</option>
          {Object.entries(SOURCE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          className="form-control"
          style={{ width: 'auto' }}
          aria-label="Độ khó"
          value={difficulty}
          onChange={(e) => changeFilter(() => setDifficulty(e.target.value))}
        >
          <option value="">Mọi độ khó</option>
          {Object.entries(DIFFICULTY_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          className="form-control"
          style={{ width: 'auto' }}
          aria-label="Sắp xếp"
          value={sort}
          onChange={(e) => changeFilter(() => setSort(e.target.value))}
        >
          {Object.entries(SORT_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              Sắp xếp: {label}
            </option>
          ))}
        </select>
      </div>

      {selected.size > 0 && (
        <div className="adm-card d-flex flex-wrap gap-2 align-items-center mb-3" role="toolbar" aria-label="Thao tác hàng loạt">
          <strong>Đã chọn {selected.size} bản</strong>
          <button className="btn btn-primary" style={btn} disabled={bulkBusy} onClick={() => bulk('PUBLIC')}>
            Công khai
          </button>
          <button className="btn" style={btn} disabled={bulkBusy} onClick={() => bulk('PRIVATE')}>
            Gỡ công khai
          </button>
          <button className="btn btn-danger" style={btn} disabled={bulkBusy} onClick={() => bulk('DELETE')}>
            Xóa
          </button>
          <button className="btn" style={btn} disabled={bulkBusy} onClick={() => setSelected(new Set())}>
            Bỏ chọn
          </button>
        </div>
      )}

      <div className="adm-card">
        <div className="table-responsive">
          <table className="table" style={{ marginTop: 0 }}>
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input type="checkbox" aria-label="Chọn tất cả bản trên trang" checked={allChecked} onChange={toggleAll} />
                </th>
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
                    <input
                      type="checkbox"
                      aria-label={`Chọn ${s.title}`}
                      checked={selected.has(s.id)}
                      onChange={() => toggleOne(s.id)}
                    />
                  </td>
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
                  <td colSpan={8}>Không có bản nhạc nào.</td>
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
            onChange={(p) => {
              setSelected(new Set());
              setPage(p);
            }}
          />
        )}
      </div>
    </>
  );
}
