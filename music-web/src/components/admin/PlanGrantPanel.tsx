import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Badge, Button, Card, CellTitle, Pager, Table, TableState } from '../ui';
import { errorMessage, formatDate } from '../ui/helpers';
import { useDialog } from '../ui/dialog-context';
import type { AdminOutletContext } from './AdminLayout';
import { adminApi, billingApi } from '../../services';
import type { Member, MemberPlanSummary, PageResult, PlanInfo } from '../../types';
import { isAdminMember, isSuperAdminMember, roleLabel } from '../../utils/auth';
import { t } from '../../i18n/core';

const PAGE_SIZE = 10;
const MAX_MONTHS = 120;
const MAX_SELECTED = 200;
const QUICK_MONTHS = [1, 3, 6, 12];
const PLAN_TONE = { FREE: 'neutral', ACTIVE: 'success', UNLIMITED: 'violet' } as const;
/** Nguồn gói có ngày hết hạn (gia hạn được). */
const DATED_SOURCES = ['PAYMENT', 'ADMIN_GRANT', 'POINTS_TRIAL'];

/** Cộng tháng theo lịch như backend (Period.ofMonths): 31/01 + 1 tháng = 28/02 hoặc 29/02. */
function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}

const iso = (d: Date) => d.toISOString();

const planLabel = (p: { status: string; name: string }) =>
  p.status === 'UNLIMITED' ? t('billing.unlimitedPlan') : p.name;

/** Một người sẽ ra sao khi cấp gói đang chọn. */
type Outcome =
  | { kind: 'skip'; reason: string }
  | { kind: 'renew'; to: Date }
  | { kind: 'new'; to: Date; replaces?: string };

function outcomeOf(m: Member, planCode: string, months: number): Outcome {
  if (isSuperAdminMember(m)) return { kind: 'skip', reason: t('admin.grants.skipSuper') };
  const plan = m.plan;
  const hasRolePro = isAdminMember(m) && plan?.source === 'ROLE' && plan.code === 'PRO' && !plan.rolePlanSuspendedUntil;
  if (planCode === 'PRO' && hasRolePro) return { kind: 'skip', reason: t('admin.grants.skipAdminPro') };
  const dated = !!plan?.expiresAt && DATED_SOURCES.includes(plan.source ?? '');
  if (dated && plan?.code === planCode && plan.expiresAt) {
    return { kind: 'renew', to: addMonths(new Date(plan.expiresAt), months) };
  }
  return { kind: 'new', to: addMonths(new Date(), months), replaces: dated ? plan?.name : undefined };
}

/**
 * Tab "Cấp gói" của trang "Gói thành viên" (chỉ SUPER_ADMIN thao tác). Bước 1: chọn gói cá nhân và số tháng. Bước 2: tích chọn nhiều thành
 * viên rồi cấp một lần (ai đang dùng đúng gói thì gia hạn nối tiếp). Tạm ngưng gói Pro của quản trị viên ở trang riêng.
 * Gói team để sau.
 */
export default function PlanGrantPanel() {
  const { admin } = useOutletContext<AdminOutletContext>();
  const canGrant = !!admin && isSuperAdminMember(admin);
  const { confirm } = useDialog();

  // Bước 1: gói và thời hạn
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [planCode, setPlanCode] = useState('');
  const [months, setMonths] = useState('1');

  // Bước 2: danh sách và các người đã chọn (giữ qua các trang)
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<PageResult<Member> | null>(null);
  const [picked, setPicked] = useState<Record<string, Member>>({});
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    billingApi
      .plans()
      .then((res) => {
        const personal = res.data.result.filter((p) => p.audience === 'PERSONAL' && p.code !== 'FREE');
        setPlans(personal);
        setPlanCode((code) => code || personal[0]?.code || '');
      })
      .catch(() => setPlans([]));
  }, []);

  useEffect(() => {
    adminApi
      .getMembers({ page, size: PAGE_SIZE, keyword: keyword || undefined })
      .then((res) => setResult(res.data.result))
      .catch((error) => toast.error(errorMessage(error, t('admin.members.loadFailed'))));
  }, [page, keyword, reloadKey]);

  const monthCount = Number(months);
  const monthsValid = Number.isInteger(monthCount) && monthCount >= 1 && monthCount <= MAX_MONTHS;
  const plan = plans.find((p) => p.code === planCode);
  const pickedList = Object.values(picked);

  const togglePick = (m: Member, on: boolean) =>
    setPicked((all) => {
      const next = { ...all };
      if (on) next[m.id] = m;
      else delete next[m.id];
      return next;
    });

  const pickable = (m: Member) => monthsValid && outcomeOf(m, planCode, monthCount).kind !== 'skip';
  const pageRows = result?.content ?? [];
  const pagePickable = pageRows.filter(pickable);
  const allOnPage = pagePickable.length > 0 && pagePickable.every((m) => picked[m.id]);

  const grantAll = async () => {
    if (!plan || !monthsValid || pickedList.length === 0) return;
    const ok = await confirm({
      title: t('admin.grants.bulkTitle', { plan: plan.name, count: pickedList.length }),
      message: t('admin.grants.bulkMessage', { months: monthCount }),
      confirmLabel: t('admin.plan.grant'),
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await billingApi.grantMany({
        planCode,
        months: monthCount,
        memberIds: pickedList.map((m) => m.id),
      });
      const count = (status: string) => res.data.result.filter((r) => r.status === status).length;
      toast.success(
        t('admin.grants.bulkDone', {
          granted: count('GRANTED'),
          renewed: count('RENEWED'),
          skipped: count('SKIPPED') + count('FAILED'),
        }),
      );
      setPicked({});
      setReloadKey((k) => k + 1);
    } catch (error) {
      toast.error(errorMessage(error, t('admin.plan.failed')));
    } finally {
      setBusy(false);
    }
  };

  const planCell = (p?: MemberPlanSummary | null) =>
    p ? (
      <CellTitle
        sub={
          p.expiresAt
            ? t('admin.members.planUntil', { date: formatDate(p.expiresAt) })
            : p.source
              ? t(`billing.source.${p.source}`)
              : undefined
        }
      >
        <Badge tone={PLAN_TONE[p.status]}>{planLabel(p)}</Badge>
        {p.rolePlanSuspendedUntil && (
          <>
            {' '}
            <Badge
              tone="danger"
              title={t('admin.grants.suspendedUntil', { date: formatDate(p.rolePlanSuspendedUntil) })}
            >
              {t('admin.grants.suspendedBadge')}
            </Badge>
          </>
        )}
      </CellTitle>
    ) : null;

  const outcomeCell = (m: Member) => {
    if (!monthsValid || !plan) return <span className="adm-muted">—</span>;
    const o = outcomeOf(m, planCode, monthCount);
    if (o.kind === 'skip') return <span className="adm-muted">{o.reason}</span>;
    if (o.kind === 'renew')
      return (
        <span className="adm-grant__outcome is-renew">
          {t('admin.grants.outcomeRenew', { date: formatDate(iso(o.to)) })}
        </span>
      );
    return (
      <CellTitle sub={o.replaces ? t('admin.grants.outcomeReplaces', { plan: o.replaces }) : undefined}>
        <span className="adm-grant__outcome">{t('admin.grants.outcomeNew', { date: formatDate(iso(o.to)) })}</span>
      </CellTitle>
    );
  };

  return (
    <>
      <p className="adm-muted adm-member-plans__intro">{t('admin.grants.subtitle')}</p>

      <Card title={t('admin.grants.step1')}>
        <div className="adm-grant__step1">
          <label className="adm-field">
            <span className="adm-field__label">{t('admin.plan.plan')}</span>
            <select
              className="adm-input"
              value={planCode}
              disabled={busy || !canGrant}
              onChange={(e) => setPlanCode(e.target.value)}
            >
              {plans.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="adm-field">
            <label className="adm-field__label" htmlFor="grant-months">
              {t('admin.grants.months')}
            </label>
            <div className="adm-grant__months">
              {QUICK_MONTHS.map((n) => (
                <Button
                  key={n}
                  size="sm"
                  variant={monthCount === n ? 'primary' : 'secondary'}
                  disabled={busy || !canGrant}
                  onClick={() => setMonths(String(n))}
                >
                  {t('admin.grants.monthsOption', { count: n })}
                </Button>
              ))}
              <input
                id="grant-months"
                className="adm-input adm-grant__months-input"
                inputMode="numeric"
                value={months}
                disabled={busy || !canGrant}
                onChange={(e) => setMonths(e.target.value.replace(/\D/g, '').slice(0, 3))}
              />
              <span className="adm-muted">{t('admin.grants.monthsUnit')}</span>
            </div>
          </div>
        </div>
        <p className="adm-grant__preview">
          {monthsValid
            ? t('admin.grants.step1Preview', {
                from: formatDate(iso(new Date())),
                to: formatDate(iso(addMonths(new Date(), monthCount))),
              })
            : t('admin.grants.monthsInvalid')}
        </p>
      </Card>

      <Card
        title={t('admin.grants.step2')}
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
        <Table minWidth={860}>
          <thead>
            <tr>
              <th className="adm-grant__check">
                {canGrant && (
                  <input
                    type="checkbox"
                    aria-label={t('admin.grants.pickPage')}
                    checked={allOnPage}
                    disabled={busy || pagePickable.length === 0}
                    onChange={(e) => pagePickable.forEach((m) => togglePick(m, e.target.checked))}
                  />
                )}
              </th>
              <th>{t('admin.menu.items.members')}</th>
              <th>{t('profile.role')}</th>
              <th>{t('admin.grants.currentColumn')}</th>
              <th>{t('admin.grants.outcomeColumn')}</th>
            </tr>
          </thead>
          <tbody>
            {!result && <TableState colSpan={5} loading />}
            {pageRows.map((m) => {
              const can = canGrant && pickable(m);
              return (
                <tr key={m.id} className={picked[m.id] ? 'is-selected' : undefined}>
                  <td className="adm-grant__check">
                    {canGrant && (
                      <input
                        type="checkbox"
                        aria-label={m.fullName || m.email}
                        checked={!!picked[m.id]}
                        disabled={busy || (!can && !picked[m.id])}
                        onChange={(e) => togglePick(m, e.target.checked)}
                      />
                    )}
                  </td>
                  <td>
                    <CellTitle sub={m.fullName ? m.email : undefined}>{m.fullName || m.email}</CellTitle>
                  </td>
                  <td>
                    <Badge tone={isSuperAdminMember(m) ? 'violet' : isAdminMember(m) ? 'primary' : 'neutral'}>
                      {roleLabel(m)}
                    </Badge>
                  </td>
                  <td>{planCell(m.plan)}</td>
                  <td>{outcomeCell(m)}</td>
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

      {canGrant && (
        <div className="adm-grant__bar" role="region" aria-label={t('admin.grants.step2')}>
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
            <Button
              variant="primary"
              loading={busy}
              disabled={!plan || !monthsValid || pickedList.length === 0 || pickedList.length > MAX_SELECTED}
              onClick={grantAll}
            >
              {plan ? t('admin.grants.grantTo', { plan: plan.name, count: pickedList.length }) : t('admin.plan.grant')}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
