import { useCallback, useEffect, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Badge, Button, Card, CellTitle, PageHeader, Pager, Table, TableState } from '../../components/ui';
import { errorMessage, formatDate } from '../../components/ui/helpers';
import { useDialog } from '../../components/ui/dialog-context';
import type { AdminOutletContext } from '../../components/admin/AdminLayout';
import { adminApi, billingApi } from '../../services';
import type { Member, MemberPlanSummary, MySubscription, PageResult, PlanInfo } from '../../types';
import { isSuperAdminMember, roleLabel } from '../../utils/auth';
import { t } from '../../i18n/core';

const PAGE_SIZE = 10;
const MAX_MONTHS = 120;
const QUICK_MONTHS = [1, 3, 6, 12];
/** Thời hạn tạm ngưng: 0 = đến hết tháng này. */
const SUSPEND_OPTIONS = [0, 1, 3, 6, 12];
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

const planLabel = (p: { status: string; name: string }) =>
  p.status === 'UNLIMITED' ? t('billing.unlimitedPlan') : p.name;

/**
 * Admin (sidebar "Cấp gói"): SUPER_ADMIN tìm thành viên, xem gói đang dùng và cấp gói cá nhân theo số tháng (cùng gói thì
 * gia hạn nối tiếp từ ngày hết hạn), hủy gói, hoặc tước/khôi phục gói Pro không thời hạn của ADMIN. Gói team để sau.
 */
export default function AdminPlanGrants() {
  const { admin } = useOutletContext<AdminOutletContext>();
  const canGrant = !!admin && isSuperAdminMember(admin);
  const { confirm } = useDialog();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('member');

  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<PageResult<Member> | null>(null);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  // Thành viên đang chọn và gói của họ, kèm id để bỏ qua kết quả cũ khi đã chọn người khác
  const [loaded, setLoaded] = useState<{ id: string; member: Member | null; sub: MySubscription | null } | null>(null);
  const [planCode, setPlanCode] = useState('');
  const [months, setMonths] = useState('1');
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [suspendMonths, setSuspendMonths] = useState(0);
  const [suspendReason, setSuspendReason] = useState('');

  useEffect(() => {
    adminApi
      .getMembers({ page, size: PAGE_SIZE, keyword: keyword || undefined })
      .then((res) => setResult(res.data.result))
      .catch((error) => toast.error(errorMessage(error, t('admin.members.loadFailed'))));
  }, [page, keyword, reloadKey]);

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

  const loadSelected = useCallback(() => {
    if (!selectedId) return;
    Promise.all([
      adminApi
        .getMember(selectedId)
        .then((res) => res.data.result)
        .catch(() => null),
      billingApi
        .ofMember(selectedId)
        .then((res) => res.data.result)
        .catch(() => null),
    ]).then(([member, sub]) => setLoaded({ id: selectedId, member, sub }));
  }, [selectedId]);

  useEffect(() => {
    loadSelected();
  }, [loadSelected]);

  const selected = loaded && loaded.id === selectedId ? loaded.member : null;
  const current = loaded && loaded.id === selectedId ? loaded.sub : null;

  const afterChange = () => {
    loadSelected();
    setReloadKey((k) => k + 1);
  };

  const monthCount = Number(months);
  const monthsValid = Number.isInteger(monthCount) && monthCount >= 1 && monthCount <= MAX_MONTHS;
  const targetIsSuper = current?.roleGrant === 'SUPER_ADMIN';
  const targetIsAdmin = current?.roleGrant === 'ADMIN';
  const suspendedUntil = targetIsAdmin ? (current?.rolePlanSuspendedUntil ?? null) : null;
  const hasRolePro = targetIsAdmin && current?.source === 'ROLE' && !suspendedUntil;
  const datedPlan = !!current?.expiresAt && DATED_SOURCES.includes(current.source ?? '');
  const isRenew = datedPlan && current?.plan.code === planCode;
  // ADMIN đang có Pro vĩnh viễn mà chọn Pro: không cần cấp, muốn ngừng thì tạm ngưng
  const includedPro = hasRolePro && planCode === 'PRO';

  const start = isRenew && current?.expiresAt ? new Date(current.expiresAt) : new Date();
  const end = monthsValid ? addMonths(start, monthCount) : null;

  const grant = async () => {
    if (!selected || !monthsValid) return;
    setBusy(true);
    try {
      const res = await billingApi.grant({ memberId: selected.id, planCode, months: monthCount });
      const { plan, expiresAt } = res.data.result;
      toast.success(
        t(isRenew ? 'admin.grants.renewed' : 'admin.plan.granted', {
          plan: plan.name,
          date: expiresAt ? formatDate(expiresAt) : '',
        }),
      );
      afterChange();
    } catch (error) {
      toast.error(errorMessage(error, t('admin.plan.failed')));
    } finally {
      setBusy(false);
    }
  };

  const suspend = async () => {
    if (!selected) return;
    const name = selected.fullName || selected.email;
    const duration =
      suspendMonths === 0 ? t('admin.grants.untilMonthEnd') : t('admin.grants.monthsOption', { count: suspendMonths });
    const ok = await confirm({
      title: t('admin.grants.suspendTitle', { name }),
      message: t('admin.grants.suspendMessage', { duration }),
      confirmLabel: t('admin.grants.suspend'),
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await billingApi.suspendRolePlan(selected.id, {
        months: suspendMonths,
        reason: suspendReason.trim() || undefined,
      });
      const until = res.data.result.rolePlanSuspendedUntil;
      toast.success(t('admin.grants.suspended', { name, date: until ? formatDate(until) : '' }));
      setSuspendReason('');
      afterChange();
    } catch (error) {
      toast.error(errorMessage(error, t('admin.plan.failed')));
    } finally {
      setBusy(false);
    }
  };

  const lift = async () => {
    if (!selected) return;
    const name = selected.fullName || selected.email;
    if (!(await confirm({ title: t('admin.grants.liftTitle', { name }), message: t('admin.grants.liftMessage') })))
      return;
    setBusy(true);
    try {
      await billingApi.liftRolePlanSuspension(selected.id);
      toast.success(t('admin.grants.lifted', { name }));
      afterChange();
    } catch (error) {
      toast.error(errorMessage(error, t('admin.plan.failed')));
    } finally {
      setBusy(false);
    }
  };

  const cancelPlan = async () => {
    if (!selected) return;
    if (
      !(await confirm({ title: t('admin.plan.cancelTitle'), message: t('admin.plan.cancelMessage'), tone: 'danger' }))
    )
      return;
    setBusy(true);
    try {
      await billingApi.cancel(selected.id);
      toast.success(t('admin.plan.canceled'));
      afterChange();
    } catch (error) {
      toast.error(errorMessage(error, t('admin.plan.failed')));
    } finally {
      setBusy(false);
    }
  };

  const select = (m: Member) => setParams({ member: m.id });

  const planCell = (plan?: MemberPlanSummary | null) =>
    plan ? (
      <CellTitle
        sub={
          plan.expiresAt
            ? t('admin.members.planUntil', { date: formatDate(plan.expiresAt) })
            : plan.source
              ? t(`billing.source.${plan.source}`)
              : undefined
        }
      >
        <Badge tone={PLAN_TONE[plan.status]}>{planLabel(plan)}</Badge>
        {plan.rolePlanSuspendedUntil && (
          <>
            {' '}
            <Badge
              tone="danger"
              title={t('admin.grants.suspendedUntil', { date: formatDate(plan.rolePlanSuspendedUntil) })}
            >
              {t('admin.grants.suspendedBadge')}
            </Badge>
          </>
        )}
      </CellTitle>
    ) : null;

  const renderPanel = () => {
    if (!selectedId) return <p className="adm-muted">{t('admin.grants.pickHint')}</p>;
    if (!selected || !current) return <TableState colSpan={1} loading />;
    return (
      <>
        <div className="adm-grant__current">
          <span className="adm-muted">{t('admin.plan.current')}</span>{' '}
          <Badge tone={PLAN_TONE[current.status]}>
            {planLabel({ status: current.status, name: current.plan.name })}
          </Badge>
          {current.source && <span className="adm-muted"> · {t(`billing.source.${current.source}`)}</span>}
          {current.expiresAt && (
            <span className="adm-muted"> · {t('billing.myPlan.expires', { date: formatDate(current.expiresAt) })}</span>
          )}
        </div>

        {targetIsSuper && <p className="adm-muted">{t('admin.plan.superAdminTarget')}</p>}

        {targetIsAdmin && (
          <div className={`adm-grant__role${suspendedUntil ? ' is-suspended' : ''}`}>
            {suspendedUntil ? (
              <>
                <span>{t('admin.grants.roleSuspended', { date: formatDate(suspendedUntil) })}</span>
                {canGrant && (
                  <Button size="sm" disabled={busy} onClick={lift}>
                    {t('admin.grants.lift')}
                  </Button>
                )}
              </>
            ) : (
              <>
                <span>{t('admin.grants.roleActive')}</span>
                {canGrant && (
                  <div className="adm-grant__suspend">
                    <select
                      className="adm-input"
                      value={suspendMonths}
                      aria-label={t('admin.grants.suspendDuration')}
                      disabled={busy}
                      onChange={(e) => setSuspendMonths(Number(e.target.value))}
                    >
                      {SUSPEND_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n === 0 ? t('admin.grants.untilMonthEnd') : t('admin.grants.monthsOption', { count: n })}
                        </option>
                      ))}
                    </select>
                    <input
                      className="adm-input"
                      value={suspendReason}
                      maxLength={255}
                      placeholder={t('admin.grants.reasonPlaceholder')}
                      disabled={busy}
                      onChange={(e) => setSuspendReason(e.target.value)}
                    />
                    <Button size="sm" variant="danger" disabled={busy} onClick={suspend}>
                      {t('admin.grants.suspend')}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {!targetIsSuper && canGrant && (
          <div className="adm-grant__form">
            <label className="adm-field">
              <span className="adm-field__label">{t('admin.plan.plan')}</span>
              <select
                className="adm-input"
                value={planCode}
                disabled={busy}
                onChange={(e) => setPlanCode(e.target.value)}
              >
                {plans.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            {!includedPro && (
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
                      disabled={busy}
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
                    disabled={busy}
                    onChange={(e) => setMonths(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  />
                  <span className="adm-muted">{t('admin.grants.monthsUnit')}</span>
                </div>
              </div>
            )}

            {includedPro ? (
              <p className="adm-grant__preview">{t('admin.grants.includedProHint')}</p>
            ) : (
              <p className="adm-grant__preview">
                {end
                  ? t(isRenew ? 'admin.grants.previewRenew' : 'admin.grants.preview', {
                      from: formatDate(start.toISOString()),
                      to: formatDate(end.toISOString()),
                    })
                  : t('admin.grants.monthsInvalid')}
                {!isRenew && datedPlan && current.plan.code !== planCode && (
                  <>
                    <br />
                    {t('admin.grants.replaceWarning', { plan: current.plan.name })}
                  </>
                )}
              </p>
            )}

            <div className="adm-grant__actions">
              {datedPlan && (
                <Button variant="ghost" disabled={busy} onClick={cancelPlan}>
                  {t('admin.plan.cancel')}
                </Button>
              )}
              {!includedPro && (
                <Button variant="primary" loading={busy} disabled={!monthsValid || !planCode} onClick={grant}>
                  {t(isRenew ? 'admin.grants.renew' : 'admin.plan.grant')}
                </Button>
              )}
            </div>
            <p className="adm-field__hint">{t('admin.plan.teamLater')}</p>
          </div>
        )}
      </>
    );
  };

  return (
    <>
      <PageHeader title={t('admin.menu.items.planGrants')} description={t('admin.grants.subtitle')} />
      {!canGrant && (
        <p className="adm-plans-note" role="note">
          {t('admin.plan.readOnly')}
        </p>
      )}

      <div className="adm-grant">
        <Card
          title={t('admin.grants.pickTitle')}
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
          <Table>
            <thead>
              <tr>
                <th>{t('admin.menu.items.members')}</th>
                <th>{t('profile.role')}</th>
                <th>{t('admin.plan.title')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!result && <TableState colSpan={4} loading />}
              {result?.content.map((m) => (
                <tr key={m.id} className={m.id === selectedId ? 'is-selected' : undefined}>
                  <td>
                    <CellTitle sub={m.fullName ? m.email : undefined}>{m.fullName || m.email}</CellTitle>
                  </td>
                  <td>
                    <Badge tone={isSuperAdminMember(m) ? 'violet' : 'neutral'}>{roleLabel(m)}</Badge>
                  </td>
                  <td>{planCell(m.plan)}</td>
                  <td className="adm-table__actions">
                    <Button size="sm" variant={m.id === selectedId ? 'primary' : 'secondary'} onClick={() => select(m)}>
                      {t('admin.grants.pick')}
                    </Button>
                  </td>
                </tr>
              ))}
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

        <Card
          title={
            selected
              ? t('admin.plan.grantTitle', { name: selected.fullName || selected.email })
              : t('admin.menu.items.planGrants')
          }
        >
          {renderPanel()}
        </Card>
      </div>
    </>
  );
}
