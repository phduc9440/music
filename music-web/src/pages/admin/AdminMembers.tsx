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
import type { Member, PageResult, RoleItem } from '../../types';
import { roleName } from '../../utils/roles';
import { isAdminMember, isSuperAdminMember, roleLabel } from '../../utils/auth';
import { useDialog } from '../../components/ui/dialog-context';
import { t } from '../../i18n/core';

const PLAN_TONE = { FREE: 'neutral', ACTIVE: 'success', UNLIMITED: 'violet' } as const;
const PAGE_SIZE = 20;

/** Admin: danh sách thành viên, khóa/mở khóa; SUPER ADMIN còn cấp/thu hồi quyền ADMIN. */
export default function AdminMembers() {
  const { admin } = useOutletContext<AdminOutletContext>();
  const viewerIsSuper = !!admin && isSuperAdminMember(admin);
  const [roles, setRoles] = useState<RoleItem[] | null>(null);
  useEffect(() => {
    if (!viewerIsSuper) return;
    adminApi
      .getRoles()
      .then((res) => setRoles(res.data.result.filter((r) => r.name !== 'SUPER_ADMIN')))
      .catch(() => setRoles(null));
  }, [viewerIsSuper]);
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

  /** Vai trò chính của thành viên: vai trò đầu tiên khác USER (không có thì USER). */
  const mainRole = (m: Member) => m.roles?.find((r) => r !== 'USER') ?? 'USER';

  const changeRole = async (m: Member, code: string) => {
    if (code === mainRole(m)) return;
    const target = roles?.find((r) => r.name === code);
    const ok = await confirm({
      title: t('admin.members.roleChangeTitle', { email: m.email }),
      message: t('admin.members.roleChangeMessage', { role: target ? roleName(target) : code }),
      confirmLabel: t('admin.members.roleChangeConfirm'),
    });
    if (!ok) return;
    update(m, { roles: code === 'USER' ? ['USER'] : [code, 'USER'] }, t('admin.members.roleUpdated'));
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
        <Table minWidth={1040}>
          <thead>
            <tr>
              <th>{t('admin.menu.items.members')}</th>
              <th>{t('profile.role')}</th>
              <th>{t('admin.plan.title')}</th>
              <th>{t('admin.official.statusColumn')}</th>
              <th>{t('admin.members.registered')}</th>
              <th>{t('admin.members.lastLogin')}</th>
              <th className="adm-table__actions">{t('scores.files.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {!result && <TableState colSpan={7} loading />}
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
                    {m.plan && (
                      <CellTitle
                        sub={
                          m.plan.expiresAt
                            ? t('admin.members.planUntil', { date: formatDate(m.plan.expiresAt) })
                            : m.plan.source
                              ? t(`billing.source.${m.plan.source}`)
                              : undefined
                        }
                      >
                        <Badge tone={PLAN_TONE[m.plan.status]}>
                          {m.plan.status === 'UNLIMITED' ? t('billing.unlimitedPlan') : m.plan.name}
                        </Badge>
                      </CellTitle>
                    )}
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
                      {viewerIsSuper && !targetSuper && roles && (
                        <select
                          className="adm-input"
                          aria-label={t('admin.roles.assign')}
                          value={mainRole(m)}
                          disabled={isSelf || busyId === m.id}
                          onChange={(e) => changeRole(m, e.target.value)}
                        >
                          {roles.map((r) => (
                            <option key={r.id} value={r.name}>
                              {roleName(r)}
                            </option>
                          ))}
                        </select>
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
