import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Link } from '../../routes/transition-nav';
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
import { t } from '../../i18n/core';

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
      .catch((error) => toast.error(errorMessage(error, t('admin.members.loadFailed'))));
  }, [page, keyword, reloadKey]);

  const update = async (member: Member, data: Parameters<typeof adminApi.updateMember>[1], okMsg: string) => {
    setBusyId(member.id);
    try {
      await adminApi.updateMember(member.id, data);
      toast.success(okMsg);
      reload();
    } catch (error) {
      toast.error(errorMessage(error, t('profile.updateFailed')));
    } finally {
      setBusyId(null);
    }
  };

  const toggleStatus = async (m: Member) => {
    const lock = m.status !== MemberStatus.INACTIVE;
    if (
      lock &&
      !(await confirm({
        title: t('admin.members.lockTitle', { email: m.email }),
        message: t('admin.members.lockMessage'),
        confirmLabel: t('admin.members.lockAccount'),
        tone: 'danger',
      }))
    )
      return;
    update(
      m,
      { status: lock ? MemberStatus.INACTIVE : MemberStatus.ACTIVE },
      lock ? t('admin.members.locked') : t('admin.members.unlocked'),
    );
  };

  const toggleAdmin = async (m: Member) => {
    const makeAdmin = !isAdminMember(m);
    const ok = await confirm(
      makeAdmin
        ? {
            title: t('admin.members.grantTitle', { email: m.email }),
            message: t('admin.members.grantMessage'),
            confirmLabel: t('admin.members.grant'),
          }
        : {
            title: t('admin.members.revokeTitle', { email: m.email }),
            confirmLabel: t('admin.members.revokeConfirm'),
            tone: 'danger',
          },
    );
    if (!ok) return;
    update(m, { roles: makeAdmin ? ['ADMIN', 'USER'] : ['USER'] }, t('admin.members.roleUpdated'));
  };

  const roleTone = (m: Member) => (isSuperAdminMember(m) ? 'violet' : isAdminMember(m) ? 'primary' : 'neutral');

  return (
    <>
      <PageHeader
        title={t('admin.menu.items.members')}
        description={t('admin.members.description')}
        actions={
          <SearchForm
            value={keywordInput}
            onChange={setKeywordInput}
            onSubmit={() => {
              setPage(0);
              setKeyword(keywordInput.trim());
            }}
            placeholder={t('admin.announcements.searchPlaceholder')}
          />
        }
      />

      <Card flush>
        <Table minWidth={900}>
          <thead>
            <tr>
              <th>{t('admin.menu.items.members')}</th>
              <th>{t('profile.role')}</th>
              <th>{t('admin.official.statusColumn')}</th>
              <th>{t('admin.members.registered')}</th>
              <th>{t('admin.members.lastLogin')}</th>
              <th className="adm-table__actions">{t('scores.files.actions')}</th>
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
                        {isSelf && <span className="adm-subtle"> ({t('admin.members.you')})</span>}
                      </CellTitle>
                    </div>
                  </td>
                  <td>
                    <Badge tone={roleTone(m)}>{roleLabel(m)}</Badge>
                  </td>
                  <td>
                    <Badge tone={locked ? 'danger' : 'success'}>
                      {locked ? t('admin.announcements.locked') : t('admin.members.active')}
                    </Badge>
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
                        title={t('admin.members.viewDetails')}
                      />
                      {viewerIsSuper && !targetSuper && (
                        <Button
                          size="sm"
                          icon="shield"
                          disabled={isSelf || busyId === m.id}
                          onClick={() => toggleAdmin(m)}
                        >
                          {isAdminMember(m) ? t('admin.members.revokeAdmin') : t('admin.members.grant')}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={locked ? 'secondary' : 'ghost'}
                        icon={locked ? 'unlock' : 'lock'}
                        disabled={isSelf || protectedTarget || busyId === m.id}
                        title={
                          isSelf
                            ? t('admin.members.cantLockSelf')
                            : protectedTarget
                              ? t('admin.members.cantLockSuper')
                              : undefined
                        }
                        onClick={() => toggleStatus(m)}
                      >
                        {locked ? t('admin.members.unlock') : t('admin.members.lock')}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {result && result.content.length === 0 && (
              <TableState
                colSpan={6}
                icon="users"
                title={t('admin.members.notFound')}
                description={t('admin.members.tryOther')}
              />
            )}
          </tbody>
        </Table>
        {result && (
          <Pager
            page={result.pageNumber}
            totalPages={result.totalPages}
            totalElements={result.totalElements}
            unit={t('admin.members.unit')}
            onChange={setPage}
          />
        )}
      </Card>
    </>
  );
}
