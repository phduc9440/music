import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { toast } from 'react-toastify';
import { adminApi } from '../../services';
import { MemberStatus } from '../../types';
import type { Member, PageResult } from '../../types';
import { isAdminMember, isSuperAdminMember, roleLabel } from '../../utils/auth';
import Pagination from '../../components/scores/Pagination';
import type { AdminOutletContext } from '../../components/admin/AdminLayout';

const PAGE_SIZE = 20;

const errMsg = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } }).response?.data?.message || fallback;

/** Admin: danh sách thành viên, khóa/mở khóa và cấp/thu hồi quyền ADMIN. */
export default function AdminMembers() {
  const { admin } = useOutletContext<AdminOutletContext>();
  const viewerIsSuper = !!admin && isSuperAdminMember(admin);
  const [result, setResult] = useState<PageResult<Member> | null>(null);
  const [page, setPage] = useState(0);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    adminApi
      .getMembers({ page, size: PAGE_SIZE, keyword: keyword || undefined })
      .then((res) => setResult(res.data.result))
      .catch((error) => toast.error(errMsg(error, 'Không tải được danh sách thành viên')));
  }, [page, keyword, reloadKey]);

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
      <div className="adm-page-head">
        <div>
          <h1>Quản lý thành viên</h1>
          <p>{result ? `${result.totalElements} thành viên` : ''}</p>
        </div>
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

      <div className="adm-card">
        <div className="table-responsive">
          <table className="table" style={{ marginTop: 0 }}>
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
                const targetSuper = isSuperAdminMember(m);
                // Admin thường không được đụng đến tài khoản SUPER ADMIN (BE cũng chặn)
                const protectedTarget = targetSuper && !viewerIsSuper;
                return (
                  <tr key={m.id}>
                    <td>
                      <Link to={`/admin/members/${m.id}`} title="Xem chi tiết">
                        {m.email}
                      </Link>
                    </td>
                    <td>{m.fullName}</td>
                    <td>
                      <span className={`badge ${isAdminMember(m) ? 'badge-admin' : 'badge-user'}`}>
                        {roleLabel(m)}
                      </span>
                    </td>
                    <td>{locked ? 'Đã khóa' : 'Hoạt động'}</td>
                    <td>
                      <div className="d-flex gap-2">
                        <Link to={`/admin/members/${m.id}`} className="btn" style={btn}>
                          Chi tiết
                        </Link>
                        {viewerIsSuper && (
                          <button
                            onClick={() => toggleAdmin(m)}
                            disabled={isSelf || targetSuper || busyId === m.id}
                            className="btn btn-primary"
                            style={btn}
                            title={isSelf || targetSuper ? 'Không thể đổi vai trò của SUPER ADMIN' : undefined}
                          >
                            {isAdminMember(m) ? 'Thu hồi ADMIN' : 'Cấp ADMIN'}
                          </button>
                        )}
                        <button
                          onClick={() => toggleStatus(m)}
                          disabled={isSelf || protectedTarget || busyId === m.id}
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
    </>
  );
}
