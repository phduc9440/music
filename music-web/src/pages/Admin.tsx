import { useCallback, useEffect, useState } from 'react';
import NotificationBell from '../components/NotificationBell';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom';
import { adminApi, authApi, scoreApi, userApi } from '../services';
import { AuthProvider, MemberStatus } from '../types';
import type { Member, PageResult, ScoreSummary } from '../types';
import { isAdminMember } from '../utils/auth';
import ChangePasswordModal from '../components/ChangePasswordModal';
import Pagination from '../components/scores/Pagination';

const PAGE_SIZE = 20;

const errMsg = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } }).response?.data?.message || fallback;

export default function AdminDashboard() {
  const [admin, setAdmin] = useState<Member | null>(null);
  const [result, setResult] = useState<PageResult<Member> | null>(null);
  const [page, setPage] = useState(0);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const navigate = useNavigate();
  const [pendingScores, setPendingScores] = useState<ScoreSummary[]>([]);
  const [pendingReload, setPendingReload] = useState(0);

  useEffect(() => {
    scoreApi
      .pendingPublic({ page: 0, size: 50 })
      .then((res) => setPendingScores(res.data.result.content))
      .catch(() => toast.error('Không tải được danh sách bản nhạc chờ duyệt'));
  }, [pendingReload]);

  const reviewPublic = async (score: ScoreSummary, approve: boolean) => {
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
      setPendingReload((n) => n + 1);
    } catch (error) {
      toast.error(errMsg(error, 'Thao tác thất bại'));
    } finally {
      setBusyId(null);
    }
  };

  useEffect(() => {
    userApi
      .getMe()
      .then((res) => setAdmin(res.data.result))
      .catch(() => toast.error('Không tải được hồ sơ quản trị viên'));
  }, []);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    adminApi
      .getMembers({ page, size: PAGE_SIZE, keyword: keyword || undefined })
      .then((res) => setResult(res.data.result))
      .catch((error) => toast.error(errMsg(error, 'Không tải được danh sách thành viên')));
  }, [page, keyword, reloadKey]);

  const handleLogout = () => {
    authApi.logout().catch(() => undefined);
    localStorage.removeItem('role');
    navigate('/');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    setKeyword(keywordInput.trim());
  };

  const update = async (member: Member, data: Parameters<typeof adminApi.updateMember>[1], okMsg: string) => {
    setBusyId(member.id);
    try {
      await adminApi.updateMember(member.id, data);
      toast.success(okMsg);
      reload();
    } catch (error) {
      toast.error(errMsg(error, 'Cập nhật thất bại'));
    } finally {
      setBusyId(null);
    }
  };

  const toggleStatus = (m: Member) => {
    const lock = m.status !== MemberStatus.INACTIVE;
    if (lock && !window.confirm(`Khóa tài khoản ${m.email}?`)) return;
    update(
      m,
      { status: lock ? MemberStatus.INACTIVE : MemberStatus.ACTIVE },
      lock ? 'Đã khóa tài khoản' : 'Đã mở khóa tài khoản',
    );
  };

  const toggleAdmin = (m: Member) => {
    const makeAdmin = !isAdminMember(m);
    const msg = makeAdmin ? `Cấp quyền ADMIN cho ${m.email}?` : `Thu hồi quyền ADMIN của ${m.email}?`;
    if (!window.confirm(msg)) return;
    update(m, { roles: makeAdmin ? ['ADMIN', 'USER'] : ['USER'] }, 'Đã cập nhật vai trò');
  };

  const btn = { padding: '0.25rem 0.75rem', fontSize: '0.75rem' };

  return (
    <>
      <nav className="navbar">
        <div className="navbar-brand">Admin Panel</div>
        <div className="navbar-nav">
          <NotificationBell />
          <span style={{ fontWeight: 600 }}>{admin?.fullName || 'Admin'}</span>
          <button
            onClick={() => navigate('/scores')}
            className="btn"
            style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
          >
            Giao diện người dùng
          </button>
          {admin?.authProvider !== AuthProvider.GOOGLE && (
            <button
              onClick={() => setIsPasswordModalOpen(true)}
              className="btn btn-primary"
              style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
            >
              Change Password
            </button>
          )}
          <button
            onClick={handleLogout}
            className="btn btn-danger"
            style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
          >
            Logout
          </button>
        </div>
      </nav>

      <div className="dashboard-container">
        <div className="glass-container">
          <h2>Bản nhạc chờ duyệt công khai ({pendingScores.length})</h2>
          <div className="table-responsive mb-4">
            <table className="table">
              <thead>
                <tr>
                  <th>Tên bản nhạc</th>
                  <th>Chủ sở hữu</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {pendingScores.map((s) => (
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
                          onClick={() => reviewPublic(s, true)}
                        >
                          Duyệt
                        </button>
                        <button
                          className="btn btn-danger"
                          style={btn}
                          disabled={busyId === s.id}
                          onClick={() => reviewPublic(s, false)}
                        >
                          Từ chối
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {pendingScores.length === 0 && (
                  <tr>
                    <td colSpan={3}>Không có bản nhạc nào đang chờ duyệt.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="d-flex justify-content-between align-items-center mb-4">
            <h2>Quản lý thành viên</h2>
            <form onSubmit={handleSearch} className="d-flex gap-2">
              <input
                className="form-control"
                placeholder="Tìm theo email hoặc tên"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
              />
              <button type="submit" className="btn btn-primary">
                Tìm
              </button>
            </form>
          </div>

          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Họ tên</th>
                  <th>Vai trò</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {result?.content.map((m) => {
                  const isSelf = m.id === admin?.id;
                  const locked = m.status === MemberStatus.INACTIVE;
                  return (
                    <tr key={m.id}>
                      <td>{m.email}</td>
                      <td>{m.fullName}</td>
                      <td>
                        <span className={`badge ${isAdminMember(m) ? 'badge-admin' : 'badge-user'}`}>
                          {isAdminMember(m) ? 'ADMIN' : 'USER'}
                        </span>
                      </td>
                      <td>{locked ? 'Đã khóa' : 'Hoạt động'}</td>
                      <td>
                        <div className="d-flex gap-2">
                          <button
                            onClick={() => toggleAdmin(m)}
                            disabled={isSelf || busyId === m.id}
                            className="btn btn-primary"
                            style={btn}
                            title={isSelf ? 'Không thể đổi vai trò của chính mình' : undefined}
                          >
                            {isAdminMember(m) ? 'Thu hồi ADMIN' : 'Cấp ADMIN'}
                          </button>
                          <button
                            onClick={() => toggleStatus(m)}
                            disabled={isSelf || busyId === m.id}
                            className={`btn ${locked ? 'btn-primary' : 'btn-danger'}`}
                            style={btn}
                            title={isSelf ? 'Không thể khóa chính mình' : undefined}
                          >
                            {locked ? 'Mở khóa' : 'Khóa'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {result && result.content.length === 0 && (
                  <tr>
                    <td colSpan={5}>Không có thành viên nào.</td>
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
      </div>

      <ChangePasswordModal isOpen={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} />
    </>
  );
}
