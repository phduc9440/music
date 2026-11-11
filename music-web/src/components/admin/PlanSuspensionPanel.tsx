import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Badge, Button, Card, CellTitle, Pager, Table, TableState } from '../ui';
import { errorMessage, formatDate } from '../ui/helpers';
import type { AdminOutletContext } from './AdminLayout';
import SuspendRolePlanDialog from './SuspendRolePlanDialog';
import { useLiftRolePlan } from './useLiftRolePlan';
import { adminApi } from '../../services';
import type { Member, PageResult } from '../../types';
import { isSuperAdminMember } from '../../utils/auth';
import { t } from '../../i18n/core';

const PAGE_SIZE = 20;

/**
 * Tab "Tạm ngưng gói" của trang "Gói thành viên": danh sách quản trị viên thường và gói Pro không thời hạn theo vai trò của họ. Chỉ
 * SUPER_ADMIN tạm ngưng (hết tháng này hoặc N tháng, tự hết hạn) hoặc mở lại sớm.
 */
export default function PlanSuspensionPanel() {
  const { admin } = useOutletContext<AdminOutletContext>();
  const canEdit = !!admin && isSuperAdminMember(admin);
  const lift = useLiftRolePlan();
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<PageResult<Member> | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [suspending, setSuspending] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    adminApi
      .getPlainAdmins({ page, size: PAGE_SIZE, keyword: keyword || undefined })
      .then((res) => setResult(res.data.result))
      .catch((error) => toast.error(errorMessage(error, t('admin.members.loadFailed'))));
  }, [page, keyword, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  return (
    <>
      <p className="adm-muted adm-member-plans__intro">{t('admin.suspensions.subtitle')}</p>
      <Card
        flush
        actions={
          <form
            className="adm-search"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(0);
              setKeyword(keywordInput.trim());
            }}
          >
            <input
              className="adm-input"
              value={keywordInput}
              placeholder={t('admin.announcements.searchPlaceholder')}
              onChange={(e) => setKeywordInput(e.target.value)}
            />
          </form>
        }
      >
        <Table minWidth={760}>
          <thead>
            <tr>
              <th>{t('admin.suspensions.adminColumn')}</th>
              <th>{t('admin.grants.currentColumn')}</th>
              <th>{t('admin.suspensions.statusColumn')}</th>
              <th className="adm-table__actions">{t('scores.files.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {!result && <TableState colSpan={4} loading />}
            {result && result.content.length === 0 && (
              <TableState colSpan={4} icon="inbox" title={t('admin.suspensions.empty')} />
            )}
            {result?.content.map((m) => {
              const name = m.fullName || m.email;
              const until = m.plan?.rolePlanSuspendedUntil;
              return (
                <tr key={m.id}>
                  <td>
                    <CellTitle sub={m.fullName ? m.email : undefined}>{name}</CellTitle>
                  </td>
                  <td>
                    {m.plan && (
                      <CellTitle
                        sub={
                          m.plan.expiresAt
                            ? t('admin.members.planUntil', { date: formatDate(m.plan.expiresAt) })
                            : undefined
                        }
                      >
                        <Badge tone={m.plan.status === 'FREE' ? 'neutral' : 'success'}>{m.plan.name}</Badge>
                      </CellTitle>
                    )}
                  </td>
                  <td>
                    {until ? (
                      <Badge tone="danger">{t('admin.suspensions.suspendedUntil', { date: formatDate(until) })}</Badge>
                    ) : (
                      <Badge tone="success">{t('admin.suspensions.active')}</Badge>
                    )}
                  </td>
                  <td className="adm-table__actions">
                    {canEdit &&
                      (until ? (
                        <Button
                          size="sm"
                          onClick={async () => {
                            if (await lift({ id: m.id, name })) reload();
                          }}
                        >
                          {t('admin.suspensions.lift')}
                        </Button>
                      ) : (
                        <Button size="sm" variant="danger" onClick={() => setSuspending({ id: m.id, name })}>
                          {t('admin.suspensions.suspend')}
                        </Button>
                      ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        {result && result.totalPages > 1 && (
          <Pager
            page={result.pageNumber}
            totalPages={result.totalPages}
            totalElements={result.totalElements}
            unit={t('admin.members.unit')}
            onChange={setPage}
          />
        )}
      </Card>

      {suspending && (
        <SuspendRolePlanDialog
          member={suspending}
          onClose={() => setSuspending(null)}
          onDone={() => {
            setSuspending(null);
            reload();
          }}
        />
      )}
    </>
  );
}
