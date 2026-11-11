import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Badge, Button, Card, CellTitle, Pager, Table, TableState } from '../ui';
import { errorMessage, formatDate } from '../ui/helpers';
import { useDialog } from '../ui/dialog-context';
import type { AdminOutletContext } from './AdminLayout';
import SuspendRolePlanDialog from './SuspendRolePlanDialog';
import { useLiftRolePlan } from './useLiftRolePlan';
import { adminApi, billingApi } from '../../services';
import type { Member, PageResult, PlanInfo } from '../../types';
import { isSuperAdminMember } from '../../utils/auth';
import { t } from '../../i18n/core';

const PAGE_SIZE = 20;
const MAX_SELECTED = 200;

type Pick = { id: string; name: string; suspended: boolean };

/**
 * Tab "Tạm ngưng gói" của trang "Gói thành viên": quản trị viên thường và gói Pro không thời hạn theo vai trò của họ. Lọc
 * theo gói đang dùng, tích nhiều người rồi tạm ngưng (hết tháng này hoặc N tháng, tự hết hạn) hoặc mở lại cùng lúc. Chỉ
 * SUPER_ADMIN thao tác.
 */
export default function PlanSuspensionPanel() {
  const { admin } = useOutletContext<AdminOutletContext>();
  const canEdit = !!admin && isSuperAdminMember(admin);
  const { confirm } = useDialog();
  const liftOne = useLiftRolePlan();
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [planCode, setPlanCode] = useState('');
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<PageResult<Member> | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [picked, setPicked] = useState<Record<string, Pick>>({});
  const [suspending, setSuspending] = useState<{ id: string; name: string }[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    billingApi
      .plans()
      .then((res) => setPlans(res.data.result.filter((p) => p.audience === 'PERSONAL')))
      .catch(() => setPlans([]));
  }, []);

  useEffect(() => {
    adminApi
      .getPlainAdmins({ page, size: PAGE_SIZE, keyword: keyword || undefined, planCode: planCode || undefined })
      .then((res) => setResult(res.data.result))
      .catch((error) => toast.error(errorMessage(error, t('admin.members.loadFailed'))));
  }, [page, keyword, planCode, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);
  const rows = result?.content ?? [];
  const pickedList = Object.values(picked);
  const allOnPage = rows.length > 0 && rows.every((m) => picked[m.id]);

  const nameOf = (m: Member) => m.fullName || m.email;
  const togglePick = (m: Member, on: boolean) =>
    setPicked((all) => {
      const next = { ...all };
      if (on) next[m.id] = { id: m.id, name: nameOf(m), suspended: !!m.plan?.rolePlanSuspendedUntil };
      else delete next[m.id];
      return next;
    });

  const afterBulk = () => {
    setPicked({});
    setSuspending(null);
    reload();
  };

  const liftMany = async () => {
    const targets = pickedList.filter((p) => p.suspended);
    if (targets.length === 0) return;
    const ok = await confirm({
      title: t('admin.suspensions.liftManyTitle', { count: targets.length }),
      message: t('admin.suspensions.liftMessage'),
      confirmLabel: t('admin.suspensions.lift'),
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await billingApi.liftRolePlanSuspensions(targets.map((p) => p.id));
      const done = res.data.result.filter((r) => r.status === 'LIFTED').length;
      toast.success(t('admin.suspensions.liftedMany', { count: done }));
      afterBulk();
    } catch (error) {
      toast.error(errorMessage(error, t('admin.plan.failed')));
    } finally {
      setBusy(false);
    }
  };

  const suspendedPicked = pickedList.filter((p) => p.suspended).length;

  return (
    <>
      <p className="adm-muted adm-member-plans__intro">{t('admin.suspensions.subtitle')}</p>
      <Card
        flush
        actions={
          <div className="adm-filter-row">
            <select
              className="adm-input"
              value={planCode}
              aria-label={t('admin.suspensions.planFilter')}
              onChange={(e) => {
                setPage(0);
                setPlanCode(e.target.value);
              }}
            >
              <option value="">{t('admin.suspensions.allPlans')}</option>
              {plans.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
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
          </div>
        }
      >
        <Table minWidth={820}>
          <thead>
            <tr>
              <th className="adm-grant__check">
                {canEdit && (
                  <input
                    type="checkbox"
                    aria-label={t('admin.grants.pickPage')}
                    checked={allOnPage}
                    disabled={busy || rows.length === 0}
                    onChange={(e) => rows.forEach((m) => togglePick(m, e.target.checked))}
                  />
                )}
              </th>
              <th>{t('admin.suspensions.adminColumn')}</th>
              <th>{t('admin.grants.currentColumn')}</th>
              <th>{t('admin.suspensions.statusColumn')}</th>
              <th className="adm-table__actions">{t('scores.files.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {!result && <TableState colSpan={5} loading />}
            {result && rows.length === 0 && (
              <TableState colSpan={5} icon="inbox" title={t('admin.suspensions.empty')} />
            )}
            {rows.map((m) => {
              const name = nameOf(m);
              const until = m.plan?.rolePlanSuspendedUntil;
              return (
                <tr key={m.id} className={picked[m.id] ? 'is-selected' : undefined}>
                  <td className="adm-grant__check">
                    {canEdit && (
                      <input
                        type="checkbox"
                        aria-label={name}
                        checked={!!picked[m.id]}
                        disabled={busy}
                        onChange={(e) => togglePick(m, e.target.checked)}
                      />
                    )}
                  </td>
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
                          disabled={busy}
                          onClick={async () => {
                            if (await liftOne({ id: m.id, name })) reload();
                          }}
                        >
                          {t('admin.suspensions.lift')}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={busy}
                          onClick={() => setSuspending([{ id: m.id, name }])}
                        >
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

      {canEdit && (
        <div className="adm-grant__bar" role="region" aria-label={t('admin.memberPlans.tabSuspend')}>
          <span>
            {t('admin.grants.selectedCount', { count: pickedList.length })}
            {pickedList.length > MAX_SELECTED && (
              <strong className="adm-grant__bar-warn"> · {t('admin.grants.tooMany', { max: MAX_SELECTED })}</strong>
            )}
          </span>
          <div className="adm-grant__actions">
            {pickedList.length > 0 && (
              <Button variant="ghost" disabled={busy} onClick={() => setPicked({})}>
                {t('admin.grants.clear')}
              </Button>
            )}
            <Button disabled={busy || suspendedPicked === 0 || pickedList.length > MAX_SELECTED} onClick={liftMany}>
              {t('admin.suspensions.liftMany', { count: suspendedPicked })}
            </Button>
            <Button
              variant="danger"
              disabled={busy || pickedList.length === 0 || pickedList.length > MAX_SELECTED}
              onClick={() => setSuspending(pickedList.map(({ id, name }) => ({ id, name })))}
            >
              {t('admin.suspensions.suspendMany', { count: pickedList.length })}
            </Button>
          </div>
        </div>
      )}

      {suspending && (
        <SuspendRolePlanDialog members={suspending} onClose={() => setSuspending(null)} onDone={afterBulk} />
      )}
    </>
  );
}
