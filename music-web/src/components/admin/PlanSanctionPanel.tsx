import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Badge, Button, Card, CellTitle, Pager, Table, TableState } from '../ui';
import { errorMessage, formatDate } from '../ui/helpers';
import type { AdminOutletContext } from './AdminLayout';
import SanctionDialog from './SanctionDialog';
import type { SanctionMode } from './SanctionDialog';
import { useLiftBans } from './useLiftBans';
import { adminApi, billingApi } from '../../services';
import type { Member, PageResult, PlanInfo } from '../../types';
import { isAdminMember, isSuperAdminMember, roleLabel } from '../../utils/auth';
import { t } from '../../i18n/core';

const PAGE_SIZE = 20;
const MAX_SELECTED = 200;
/** Nguồn gói có thể thu hồi (mua hoặc được cấp, có ngày hết hạn). */
const REVOCABLE_SOURCES = ['PAYMENT', 'ADMIN_GRANT', 'POINTS_TRIAL'];
const PLAN_TONE = { FREE: 'neutral', ACTIVE: 'success', UNLIMITED: 'violet' } as const;

type Picked = { id: string; name: string; banned: boolean; revocable: boolean };

const revocable = (m: Member) => !!m.plan?.expiresAt && REVOCABLE_SOURCES.includes(m.plan.source ?? '');

/**
 * Tab "Xử lý vi phạm" của trang "Gói thành viên" (chỉ SUPER_ADMIN thao tác): lọc theo gói đang dùng hoặc người đang bị cấm,
 * tích nhiều người rồi thu hồi gói (hủy ngay, muốn dùng phải mua lại), cấm dùng gói trả phí 1/3/6/12 tháng, hoặc gỡ cấm.
 */
export default function PlanSanctionPanel() {
  const { admin } = useOutletContext<AdminOutletContext>();
  const canEdit = !!admin && isSuperAdminMember(admin);
  const liftBans = useLiftBans();
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [planCode, setPlanCode] = useState('');
  const [bannedOnly, setBannedOnly] = useState(false);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<PageResult<Member> | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [picked, setPicked] = useState<Record<string, Picked>>({});
  const [dialog, setDialog] = useState<{ mode: SanctionMode; members: { id: string; name: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    billingApi
      .plans()
      .then((res) => setPlans(res.data.result.filter((p) => p.audience === 'PERSONAL' && p.code !== 'FREE')))
      .catch(() => setPlans([]));
  }, []);

  useEffect(() => {
    adminApi
      .getMembersWithPlan({
        page,
        size: PAGE_SIZE,
        keyword: keyword || undefined,
        planCode: planCode || undefined,
        bannedOnly: bannedOnly || undefined,
      })
      .then((res) => setResult(res.data.result))
      .catch((error) => toast.error(errorMessage(error, t('admin.members.loadFailed'))));
  }, [page, keyword, planCode, bannedOnly, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);
  const rows = (result?.content ?? []).filter((m) => !isSuperAdminMember(m) || !canEdit);
  const selectable = rows.filter((m) => !isSuperAdminMember(m));
  const pickedList = Object.values(picked);
  const allOnPage = selectable.length > 0 && selectable.every((m) => picked[m.id]);
  const nameOf = (m: Member) => m.fullName || m.email;

  const togglePick = (m: Member, on: boolean) =>
    setPicked((all) => {
      const next = { ...all };
      if (on)
        next[m.id] = { id: m.id, name: nameOf(m), banned: (m.plan?.bans?.length ?? 0) > 0, revocable: revocable(m) };
      else delete next[m.id];
      return next;
    });

  const afterAction = () => {
    setPicked({});
    setDialog(null);
    reload();
  };

  const bannedPicked = pickedList.filter((p) => p.banned);
  const revocablePicked = pickedList.filter((p) => p.revocable);
  const tooMany = pickedList.length > MAX_SELECTED;

  return (
    <>
      <p className="adm-muted adm-member-plans__intro">{t('admin.sanctions.subtitle')}</p>
      <Card
        flush
        actions={
          <div className="adm-filter-row">
            <select
              className="adm-input"
              value={planCode}
              aria-label={t('admin.sanctions.planFilter')}
              onChange={(e) => {
                setPage(0);
                setPlanCode(e.target.value);
              }}
            >
              <option value="">{t('admin.sanctions.allPlans')}</option>
              {plans.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
            <label className="adm-filter-row__check">
              <input
                type="checkbox"
                checked={bannedOnly}
                onChange={(e) => {
                  setPage(0);
                  setBannedOnly(e.target.checked);
                }}
              />
              {t('admin.sanctions.bannedOnly')}
            </label>
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
        <Table minWidth={900}>
          <thead>
            <tr>
              <th className="adm-grant__check">
                {canEdit && (
                  <input
                    type="checkbox"
                    aria-label={t('admin.grants.pickPage')}
                    checked={allOnPage}
                    disabled={busy || selectable.length === 0}
                    onChange={(e) => selectable.forEach((m) => togglePick(m, e.target.checked))}
                  />
                )}
              </th>
              <th>{t('admin.menu.items.members')}</th>
              <th>{t('profile.role')}</th>
              <th>{t('admin.grants.currentColumn')}</th>
              <th>{t('admin.sanctions.statusColumn')}</th>
              <th className="adm-table__actions">{t('scores.files.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {!result && <TableState colSpan={6} loading />}
            {result && rows.length === 0 && <TableState colSpan={6} icon="inbox" title={t('admin.sanctions.empty')} />}
            {rows.map((m) => {
              const name = nameOf(m);
              const bans = m.plan?.bans ?? [];
              const banned = bans.length > 0;
              const isSuper = isSuperAdminMember(m);
              return (
                <tr key={m.id} className={picked[m.id] ? 'is-selected' : undefined}>
                  <td className="adm-grant__check">
                    {canEdit && !isSuper && (
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
                    <Badge tone={isSuper ? 'violet' : isAdminMember(m) ? 'primary' : 'neutral'}>{roleLabel(m)}</Badge>
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
                    {banned ? (
                      bans.map((b) => (
                        <div key={b.planCode}>
                          <Badge tone="danger">
                            {t('admin.sanctions.banBadge', { plan: b.planName, date: formatDate(b.until) })}
                          </Badge>
                        </div>
                      ))
                    ) : (
                      <span className="adm-muted">{t('admin.sanctions.normal')}</span>
                    )}
                  </td>
                  <td className="adm-table__actions">
                    {canEdit && !isSuper && (
                      <div className="adm-table__actions-inner">
                        {revocable(m) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => setDialog({ mode: 'revoke', members: [{ id: m.id, name }] })}
                          >
                            {t('admin.sanctions.revoke')}
                          </Button>
                        )}
                        {banned && (
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={async () => {
                              if (await liftBans([{ id: m.id, name }])) reload();
                            }}
                          >
                            {t('admin.sanctions.lift')}
                          </Button>
                        )}
                        {m.plan && m.plan.status !== 'FREE' && (
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={busy}
                            onClick={() => setDialog({ mode: 'ban', members: [{ id: m.id, name }] })}
                          >
                            {t('admin.sanctions.ban')}
                          </Button>
                        )}
                      </div>
                    )}
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
        <div className="adm-grant__bar" role="region" aria-label={t('admin.memberPlans.tabSanction')}>
          <span>
            {t('admin.grants.selectedCount', { count: pickedList.length })}
            {tooMany && (
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
              disabled={busy || tooMany || bannedPicked.length === 0}
              onClick={async () => {
                setBusy(true);
                if (await liftBans(bannedPicked)) afterAction();
                setBusy(false);
              }}
            >
              {t('admin.sanctions.liftMany', { count: bannedPicked.length })}
            </Button>
            <Button
              disabled={busy || tooMany || revocablePicked.length === 0}
              onClick={() => setDialog({ mode: 'revoke', members: revocablePicked })}
            >
              {t('admin.sanctions.revokeMany', { count: revocablePicked.length })}
            </Button>
            <Button
              variant="danger"
              disabled={busy || tooMany || pickedList.length === 0}
              onClick={() => setDialog({ mode: 'ban', members: pickedList })}
            >
              {t('admin.sanctions.banMany', { count: pickedList.length })}
            </Button>
          </div>
        </div>
      )}

      {dialog && (
        <SanctionDialog
          mode={dialog.mode}
          members={dialog.members}
          onClose={() => setDialog(null)}
          onDone={afterAction}
        />
      )}
    </>
  );
}
