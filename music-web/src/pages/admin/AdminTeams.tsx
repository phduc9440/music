import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Link } from '../../routes/transition-nav';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CellTitle,
  PageHeader,
  Pager,
  SearchForm,
  StatCard,
  StatGrid,
  Table,
  TableState,
  Tabs,
} from '../../components/ui';
import { errorMessage, formatDate } from '../../components/ui/helpers';
import { useDialog } from '../../components/ui/dialog-context';
import { adminTeamApi } from '../../services';
import { deleteTeamAsAdmin, restoreTeamAsAdmin } from './adminTeamActions';
import type { AdminTeam, AdminTeamSummary, PageResult } from '../../types';
import { formatNumber, formatRelativeTime, t } from '../../i18n/core';

const PAGE_SIZE = 20;

/** Admin: danh sách team (tìm theo tên team, tên / email người tạo), số liệu tổng quan, xóa mềm team vi phạm và khôi phục trong 30 ngày. */
export default function AdminTeams() {
  const { prompt, confirm } = useDialog();
  const [view, setView] = useState<'active' | 'deleted'>('active');
  const [summary, setSummary] = useState<AdminTeamSummary | null>(null);
  const [result, setResult] = useState<PageResult<AdminTeam> | null>(null);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    adminTeamApi
      .summary()
      .then((res) => setSummary(res.data.result))
      .catch(() => toast.error(t('admin.teams.loadFailed')));
  }, [reload]);

  const load = useCallback(() => {
    adminTeamApi
      .search({ keyword: keyword || undefined, deleted: view === 'deleted', page, size: PAGE_SIZE })
      .then((res) => setResult(res.data.result))
      .catch((error) => toast.error(errorMessage(error, t('admin.teams.loadFailed'))));
  }, [keyword, page, view]);

  useEffect(load, [load, reload]);

  const remove = async (team: AdminTeam) => {
    setBusyId(team.id);
    const ok = await deleteTeamAsAdmin(team, prompt);
    setBusyId(null);
    if (ok) setReload((n) => n + 1);
  };

  const restore = async (team: AdminTeam) => {
    setBusyId(team.id);
    const ok = await restoreTeamAsAdmin(team, confirm);
    setBusyId(null);
    if (ok) setReload((n) => n + 1);
  };

  const deletedView = view === 'deleted';

  return (
    <>
      <PageHeader
        title={t('admin.menu.items.teams')}
        description={t('admin.teams.description')}
        actions={
          <SearchForm
            value={keywordInput}
            onChange={setKeywordInput}
            onSubmit={() => {
              setPage(0);
              setKeyword(keywordInput.trim());
            }}
            placeholder={t('admin.teams.searchPlaceholder')}
          />
        }
      />

      <StatGrid>
        <StatCard
          label={t('admin.teams.stats.teams')}
          icon="share"
          tone="primary"
          value={summary ? formatNumber(summary.teams) : '—'}
          hint={summary ? t('admin.teams.stats.active', { count: summary.activeTeams7d }) : undefined}
        />
        <StatCard
          label={t('admin.teams.stats.members')}
          icon="users"
          tone="violet"
          value={summary ? formatNumber(summary.teamMembers) : '—'}
          hint={t('admin.teams.stats.membersHint')}
        />
        <StatCard
          label={t('admin.teams.stats.shows')}
          icon="list"
          tone="success"
          value={summary ? formatNumber(summary.preparingShows) : '—'}
          hint={summary ? t('admin.teams.stats.openItems', { count: summary.openItems }) : undefined}
        />
        <StatCard
          label={t('admin.teams.stats.overdue')}
          icon="clock"
          tone={summary && summary.overdueItems > 0 ? 'warning' : 'neutral'}
          value={summary ? formatNumber(summary.overdueItems) : '—'}
          hint={t('admin.teams.stats.overdueHint')}
        />
      </StatGrid>

      <Tabs
        value={view}
        onChange={(v) => {
          setView(v);
          setPage(0);
          setResult(null);
        }}
        items={[
          { value: 'active', label: t('admin.teams.tabs.active') },
          { value: 'deleted', label: t('admin.teams.tabs.deleted') },
        ]}
      />

      <Card flush>
        <Table minWidth={1080}>
          <thead>
            <tr>
              <th>{t('admin.teams.team')}</th>
              <th>{t('admin.teams.creator')}</th>
              <th className="adm-table__num">{t('admin.teams.members')}</th>
              <th className="adm-table__num">{t('admin.teams.scores')}</th>
              <th className="adm-table__num">{t('admin.teams.shows')}</th>
              <th>{deletedView ? t('admin.teams.tabs.deleted') : t('admin.teams.plan')}</th>
              <th>{t('admin.teams.lastActivity')}</th>
              <th className="adm-table__actions">{t('scores.files.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {!result && <TableState colSpan={8} loading />}
            {result?.content.map((team) => (
              <tr key={team.id}>
                <td>
                  <CellTitle sub={t('admin.teams.createdOn', { date: formatDate(team.createdAt) })}>
                    <Link to={`/admin/teams/${team.id}`}>{team.name}</Link>
                  </CellTitle>
                </td>
                <td>
                  <CellTitle sub={team.creatorName !== team.creatorEmail ? team.creatorEmail : undefined}>
                    <Link to={`/admin/members/${team.creatorId}`}>{team.creatorName}</Link>
                  </CellTitle>
                </td>
                <td className="adm-table__num">
                  {formatNumber(team.memberCount)}
                  {team.memberLimit != null && <span className="adm-muted">/{formatNumber(team.memberLimit)}</span>}
                </td>
                <td className="adm-table__num">{formatNumber(team.scoreCount)}</td>
                <td className="adm-table__num">
                  {t('admin.teams.showsCell', { preparing: team.preparingShows, total: team.showCount })}
                </td>
                <td>
                  {deletedView ? (
                    <CellTitle
                      sub={
                        team.restorable
                          ? t('admin.teams.restorableUntil', { date: formatDate(team.restorableUntil) })
                          : t('admin.teams.restoreExpired')
                      }
                    >
                      <Badge tone={team.deletedByAdmin ? 'danger' : 'neutral'}>
                        {team.deletedByAdmin ? t('admin.teams.deletedByAdmin') : t('admin.teams.deletedByOwner')}
                      </Badge>{' '}
                      <span className="adm-muted">
                        {t('admin.teams.deletedOn', { date: formatDate(team.deletedAt) })}
                      </span>
                      {team.deletedReason && (
                        <div className="adm-muted">
                          {t('admin.teams.deletedReasonLabel', { reason: team.deletedReason })}
                        </div>
                      )}
                    </CellTitle>
                  ) : (
                    <Badge tone={team.planActive ? 'success' : 'warning'}>
                      {team.planActive ? t('admin.teams.planActive') : t('admin.teams.planInactive')}
                    </Badge>
                  )}
                </td>
                <td className="adm-nowrap adm-muted">
                  {team.lastActivityAt ? formatRelativeTime(team.lastActivityAt) : t('admin.teams.noActivity')}
                </td>
                <td className="adm-table__actions">
                  <div className="adm-table__actions-inner">
                    <ButtonLink
                      to={`/admin/teams/${team.id}`}
                      size="sm"
                      variant="ghost"
                      icon="eye"
                      title={t('admin.teams.view')}
                    />
                    {deletedView ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="refresh"
                        disabled={busyId === team.id || !team.restorable}
                        title={team.restorable ? t('admin.teams.restore') : t('admin.teams.restoreExpired')}
                        onClick={() => restore(team)}
                      />
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="trash"
                        disabled={busyId === team.id}
                        title={t('admin.teams.delete')}
                        onClick={() => remove(team)}
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {result && result.content.length === 0 && (
              <TableState
                colSpan={8}
                icon="share"
                title={
                  keyword
                    ? t('admin.teams.notFound')
                    : deletedView
                      ? t('admin.teams.emptyDeleted')
                      : t('admin.teams.empty')
                }
                description={keyword ? t('admin.members.tryOther') : undefined}
              />
            )}
          </tbody>
        </Table>
        {result && (
          <Pager
            page={result.pageNumber}
            totalPages={result.totalPages}
            totalElements={result.totalElements}
            unit={t('admin.teams.unit')}
            onChange={setPage}
          />
        )}
      </Card>
    </>
  );
}
