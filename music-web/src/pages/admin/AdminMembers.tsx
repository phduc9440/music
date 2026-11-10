import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { toast } from 'react-toastify';
import type { AdminOutletContext } from '../../components/admin/AdminLayout';
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Card,
  CellTitle,
  PageHeader,
  Pager,
  SearchForm,
  Table,
  TableState,
} from '../../components/ui';
import { errorMessage, formatDate, formatDateTime } from '../../components/ui/helpers';
import { adminApi } from '../../services';
import { MemberStatus } from '../../types';
import type { Member, PageResult } from '../../types';
import { isAdminMember, isSuperAdminMember, roleLabel } from '../../utils/auth';
import { useDialog } from '../../components/ui/dialog-context';

const PAGE_SIZE = 20;

/** Admin: danh sách thành viên, khóa/mở khóa; SUPER ADMIN còn cấp/thu hồi quyền ADMIN. */
export default function AdminMembers() {
  const { admin } = useOutletContext<AdminOutletContext>();
  const viewerIsSuper = !!admin && isSuperAdminMember(admin);
  const { confirm } = useDialog();
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
      .catch((error) => toast.error(errorMessage(error, 'Không tải được danh sách thành viên')));
  }, [page, keyword, reloadKey]);

  const update = async (member: Member, data: Parameters<typeof adminApi.updateMember>[1], okMsg: string) => {
    setBusyId(member.id);
    try {
      await adminApi.updateMember(member.id, data);
      toast.success(okMsg);
      reload();
    } catch (error) {
      toast.error(errorMessage(error, 'Cập nhật thất bại'));
    } finally {
      setBusyId(null);
    }
  };

  const toggleStatus = async (m: Member) => {
    const lock = m.status !== MemberStatus.INACTIVE;
    if (
      lock &&
      !(await confirm({
        title: `Khóa tài khoản ${m.email}?`,
        message: 'Người này sẽ bị đăng xuất ngay và không đăng nhập lại được cho đến khi được mở khóa.',
        confirmLabel: 'Khóa tài khoản',
        tone: 'danger',
      }))
    )
      return;
    update(
      m,
      { status: lock ? MemberStatus.INACTIVE : MemberStatus.ACTIVE },
      lock ? 'Đã khóa tài khoản' : 'Đã mở khóa tài khoản',
    );
  };

  const toggleAdmin = async (m: Member) => {
    const makeAdmin = !isAdminMember(m);
    const ok = await confirm(
      makeAdmin
        ? {
            title: `Cấp quyền ADMIN cho ${m.email}?`,
            message: 'Người này sẽ vào được trang quản trị.',
            confirmLabel: 'Cấp ADMIN',
          }
        : { title: `Thu hồi quyền ADMIN của ${m.email}?`, confirmLabel: 'Thu hồi', tone: 'danger' },
    );
    if (!ok) return;
    update(m, { roles: makeAdmin ? ['ADMIN', 'USER'] : ['USER'] }, 'Đã cập nhật vai trò');
  };

  const roleTone = (m: Member) => (isSuperAdminMember(m) ? 'violet' : isAdminMember(m) ? 'primary' : 'neutral');

  return (
    <>
      <PageHeader
        title="Thành viên"
        description="Xem tài khoản, khóa hoặc mở khóa. Chỉ SUPER ADMIN được cấp hoặc thu hồi quyền ADMIN."
        actions={
          <SearchForm
            value={keywordInput}
            onChange={setKeywordInput}
            onSubmit={() => {
              setPage(0);
              setKeyword(keywordInput.trim());
            }}
            placeholder="Tìm theo email hoặc tên"
          />
        }
      />

      <Card flush>
        <Table minWidth={900}>
          <thead>
            <tr>
              <th>Thành viên</th>
              <th>Vai trò</th>
              <th>Trạng thái</th>
              <th>Ngày đăng ký</th>
              <th>Đăng nhập cuối</th>
              <th className="adm-table__actions">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {!result && <TableState colSpan={6} loading />}
            {result?.content.map((m) => {
              const isSelf = m.id === admin?.id;
              const locked = m.status === MemberStatus.INACTIVE;
              const targetSuper = isSuperAdminMember(m);
              // Admin thường không được đụng đến tài khoản SUPER ADMIN (BE cũng chặn)
              const protectedTarget = targetSuper && !viewerIsSuper;
              return (
                <tr key={m.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <Avatar name={m.fullName || m.email} src={m.avatarUrl} size={32} />
                      <CellTitle sub={m.fullName ? m.email : undefined}>
                        <Link to={`/admin/members/${m.id}`}>{m.fullName || m.email}</Link>
                        {isSelf && <span className="adm-subtle"> (bạn)</span>}
                      </CellTitle>
                    </div>
                  </td>
                  <td>
                    <Badge tone={roleTone(m)}>{roleLabel(m)}</Badge>
                  </td>
                  <td>
                    <Badge tone={locked ? 'danger' : 'success'}>{locked ? 'Đã khóa' : 'Hoạt động'}</Badge>
                  </td>
                  <td className="adm-nowrap adm-muted">{formatDate(m.createdAt)}</td>
                  <td className="adm-nowrap adm-muted">{formatDateTime(m.lastLoginAt)}</td>
                  <td className="adm-table__actions">
                    <div className="adm-table__actions-inner">
                      <ButtonLink
                        to={`/admin/members/${m.id}`}
                        size="sm"
                        variant="ghost"
                        icon="eye"
                        title="Xem chi tiết"
                      />
                      {viewerIsSuper && !targetSuper && (
                        <Button
                          size="sm"
                          icon="shield"
                          disabled={isSelf || busyId === m.id}
                          onClick={() => toggleAdmin(m)}
                        >
                          {isAdminMember(m) ? 'Thu hồi ADMIN' : 'Cấp ADMIN'}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={locked ? 'secondary' : 'ghost'}
                        icon={locked ? 'unlock' : 'lock'}
                        disabled={isSelf || protectedTarget || busyId === m.id}
                        title={
                          isSelf
                            ? 'Không thể khóa chính mình'
                            : protectedTarget
                              ? 'Không thể khóa SUPER ADMIN'
                              : undefined
                        }
                        onClick={() => toggleStatus(m)}
                      >
                        {locked ? 'Mở khóa' : 'Khóa'}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {result && result.content.length === 0 && (
              <TableState colSpan={6} icon="users" title="Không tìm thấy thành viên" description="Thử từ khóa khác." />
            )}
          </tbody>
        </Table>
        {result && (
          <Pager
            page={result.pageNumber}
            totalPages={result.totalPages}
            totalElements={result.totalElements}
            unit="thành viên"
            onChange={setPage}
          />
        )}
      </Card>
    </>
  );
}
